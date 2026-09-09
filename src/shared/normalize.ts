/**
 * 表格 → 标准 VideoRecord 的纯映射逻辑（不依赖 electron，可单测）。
 * 文件 IO 在 src/main/ingest.ts。
 */
import { FIELD_LABELS, FIELD_MATCH_ORDER, type PlatformDef, type StandardField } from './platforms'
import { normalizeHeader, parseCount, parseDateTime, parseDurationSec, parsePercent } from './parse'
import type { VideoRecord } from './types'

export interface ParsedTable {
  headers: string[]
  rows: Array<Record<string, unknown>>
}

/** 按平台映射把列认领到标准字段：先精确匹配，再子串包含匹配，每列只归一个字段 */
export function matchColumns(
  headers: string[],
  platform: PlatformDef
): { fieldColumns: Partial<Record<StandardField, string>>; unmappedColumns: string[] } {
  const used = new Set<string>()
  const fieldColumns: Partial<Record<StandardField, string>> = {}
  for (const field of FIELD_MATCH_ORDER) {
    const candidates = (platform.columns[field] ?? []).map((c) => normalizeHeader(c)).filter(Boolean)
    if (candidates.length === 0) continue
    let found = headers.find((h) => !used.has(h) && candidates.some((c) => h === c))
    if (!found) {
      // 双向包含：既能用「播放量」匹配候选「播放」，也能用短列名「赞」匹配候选「点赞」
      found = headers.find(
        (h) => !used.has(h) && h.length > 0 && candidates.some((c) => h.includes(c) || c.includes(h))
      )
    }
    if (found) {
      used.add(found)
      fieldColumns[field] = found
    }
  }
  const unmappedColumns = headers.filter((h) => h && !used.has(h))
  return { fieldColumns, unmappedColumns }
}

export function mapRecords(
  table: ParsedTable,
  platform: PlatformDef
): { records: VideoRecord[]; warnings: string[]; unmappedColumns: string[] } {
  const { fieldColumns, unmappedColumns } = matchColumns(table.headers, platform)
  const get = (row: Record<string, unknown>, field: StandardField): unknown => {
    const col = fieldColumns[field]
    return col != null ? row[col] : undefined
  }

  const records: VideoRecord[] = []
  const warnings: string[] = []
  let skipped = 0

  table.rows.forEach((row, i) => {
    const title = String(get(row, 'title') ?? '').trim()
    const plays = parseCount(get(row, 'plays')) ?? 0
    if (!title && !plays) {
      skipped++
      return
    }
    records.push({
      id: `v${i}`,
      title: title || '(无标题)',
      publishTime: parseDateTime(get(row, 'publishTime')),
      durationSec: parseDurationSec(get(row, 'durationSec')),
      plays,
      likes: parseCount(get(row, 'likes')) ?? 0,
      comments: parseCount(get(row, 'comments')) ?? 0,
      shares: parseCount(get(row, 'shares')) ?? 0,
      collects: parseCount(get(row, 'collects')) ?? 0,
      followsGained: parseCount(get(row, 'followsGained')),
      completionRate: parsePercent(get(row, 'completionRate')),
      avgWatchSec: parseDurationSec(get(row, 'avgWatchSec'))
    })
  })

  if (skipped > 0) warnings.push(`跳过了 ${skipped} 行无标题且无播放量的空行`)
  for (const field of ['title', 'plays'] as StandardField[]) {
    if (!fieldColumns[field]) {
      warnings.push(`未识别到「${FIELD_LABELS[field]}」列，相关统计可能不准`)
    }
  }
  if (records.length === 0) warnings.push('没有解析出任何有效数据行，请确认表格内容')

  return { records, warnings, unmappedColumns }
}
