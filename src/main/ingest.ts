import { readFile } from 'fs/promises'
import { extname } from 'path'
import * as ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { getPlatform } from '@shared/platforms'
import { normalizeHeader } from '@shared/parse'
import { mapRecords, matchColumns } from '@shared/normalize'
import { findSuspicious } from '@shared/metrics'
import { saveSnapshot } from './history'
import type { Snapshot, TableInspect } from '@shared/types'

export interface ImportMeta {
  /** 账号名，多账号隔离用 */
  account?: string
  /** 周期备注 */
  note?: string
}

/** exceljs 单元格值可能是富文本/公式/超链接对象，展平成原始值 */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v
  const obj = v as unknown as Record<string, unknown>
  if (Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('')
  }
  if ('result' in obj) return obj.result
  if ('text' in obj) return obj.text
  return v
}

export async function readTable(filePath: string): Promise<{ headers: string[]; rows: Array<Record<string, unknown>> }> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.csv') {
    const text = await readFile(filePath, 'utf-8')
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => normalizeHeader(h)
    })
    return { headers: res.meta.fields ?? [], rows: res.data }
  }

  const wb = new ExcelJS.Workbook()
  // exceljs 的 Buffer 类型声明较旧，需要显式收窄
  const buf = Buffer.from(await readFile(filePath))
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer)
  const ws = wb.worksheets[0]
  if (!ws || ws.rowCount < 2) return { headers: [], rows: [] }

  // 表头行：部分导出表格首行是报表标题，取前 10 行里第一个非空单元格≥2 的行
  let headerRowNo = 0
  const limit = Math.min(ws.rowCount, 10)
  for (let i = 1; i <= limit; i++) {
    const vals = (ws.getRow(i).values ?? []) as unknown[]
    const filled = vals
      .slice(1)
      .filter((v) => {
        const c = cellValue(v as ExcelJS.CellValue)
        return c !== null && c !== ''
      }).length
    if (filled >= 2) {
      headerRowNo = i
      break
    }
  }
  if (!headerRowNo) return { headers: [], rows: [] }

  const headerRow = ws.getRow(headerRowNo)
  const headers: string[] = []
  headerRow.eachCell((cell, col) => {
    headers[col] = normalizeHeader(cellValue(cell.value))
  })

  const rows: Array<Record<string, unknown>> = []
  for (let i = headerRowNo + 1; i <= ws.rowCount; i++) {
    const values = (ws.getRow(i).values ?? []) as unknown[]
    if (!values || values.length === 0) continue
    const row: Record<string, unknown> = {}
    let filled = 0
    for (let col = 1; col < headers.length; col++) {
      const h = headers[col]
      if (!h) continue
      const v = cellValue(values[col] as ExcelJS.CellValue)
      row[h] = v
      if (v !== null && v !== undefined && v !== '') filled++
    }
    if (filled > 0) rows.push(row)
  }
  return { headers: headers.filter(Boolean), rows }
}

/** 只读解析表格，返回列映射预检结果（不落库） */
export async function inspectTable(filePath: string, platformId: string): Promise<TableInspect> {
  const platform = getPlatform(platformId)
  const table = await readTable(filePath)
  const { fieldColumns, unmappedColumns } = matchColumns(table.headers, platform)
  const samples: Record<string, string> = {}
  for (const h of table.headers) {
    const first = table.rows.find((row) => {
      const v = row[h]
      return v !== null && v !== undefined && String(v).trim() !== ''
    })
    if (first) samples[h] = String(first[h]).slice(0, 40)
  }
  return {
    fileName: filePath.split(/[\\/]/).pop() ?? filePath,
    headers: table.headers,
    rowCount: table.rows.length,
    fieldColumns,
    unmappedColumns,
    samples
  }
}

export async function importFromFile(filePath: string, platformId: string, meta?: ImportMeta): Promise<Snapshot> {
  const platform = getPlatform(platformId)
  const table = await readTable(filePath)
  const { records, warnings, unmappedColumns } = mapRecords(table, platform)
  warnings.push(...findSuspicious(records))
  const snapshot: Snapshot = {
    id: `${platform.id}-${Date.now()}`,
    platform: platform.id,
    platformLabel: platform.label,
    account: (meta?.account ?? '').trim(),
    note: (meta?.note ?? '').trim(),
    fileName: filePath.split(/[\\/]/).pop() ?? filePath,
    importedAt: new Date().toISOString(),
    recordCount: records.length,
    warnings,
    unmappedColumns,
    records
  }
  await saveSnapshot(snapshot)
  return snapshot
}
