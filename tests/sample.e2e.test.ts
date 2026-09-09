import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { readTable } from '../src/main/ingest'
import { mapRecords } from '../src/shared/normalize'
import { getPlatform } from '../src/shared/platforms'
import { computeTotals, runAnalysis } from '../src/shared/metrics'
import type { Snapshot } from '../src/shared/types'

const SAMPLES = join(__dirname, '..', 'samples')

function makeSnapshot(id: string, fileName: string, records: Snapshot['records']): Snapshot {
  return {
    id,
    platform: 'douyin',
    platformLabel: '抖音',
    fileName,
    importedAt: id,
    recordCount: records.length,
    warnings: [],
    unmappedColumns: [],
    records
  }
}

describe.skipIf(!existsSync(join(SAMPLES, 'sample_douyin_period1.xlsx')))(
  '样例数据端到端（xlsx → 解析 → 映射 → 指标）',
  () => {
    it('期1：抖音默认列名', async () => {
      const table = await readTable(join(SAMPLES, 'sample_douyin_period1.xlsx'))
      expect(table.rows.length).toBeGreaterThan(20)
      const { records, warnings, unmappedColumns } = mapRecords(table, getPlatform('douyin'))
      expect(records.length).toBe(table.rows.length)
      expect(warnings).toEqual([])
      expect(unmappedColumns).toEqual([])
      for (const r of records) {
        expect(r.title).not.toBe('')
        expect(r.publishTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
        expect(r.plays).toBeGreaterThan(0)
        expect(r.durationSec).not.toBeNull()
        expect(r.completionRate).not.toBeNull()
      }
      const analysis = runAnalysis(makeSnapshot('p1', 'sample_douyin_period1.xlsx', records), null)
      expect(analysis.trend.length).toBeGreaterThan(3)
      expect(analysis.hourStats.length).toBeGreaterThan(3)
      expect(analysis.topByPlays.length).toBe(5)
    })

    it('期2：差异化列名（万单位播放量、纯数字完播率）', async () => {
      const table = await readTable(join(SAMPLES, 'sample_douyin_period2.xlsx'))
      const { records, unmappedColumns } = mapRecords(table, getPlatform('douyin'))
      expect(records.length).toBe(table.rows.length)
      expect(unmappedColumns).toEqual([])
      expect(records.every((r) => r.plays > 0)).toBe(true)
      expect(records.every((r) => r.completionRate != null && r.completionRate >= 5)).toBe(true)
      const totals = computeTotals(records)
      expect(totals.engagementRate).toBeGreaterThan(0)
      expect(totals.engagementRate).toBeLessThan(30)
    })

    it('两期环比', async () => {
      const t1 = await readTable(join(SAMPLES, 'sample_douyin_period1.xlsx'))
      const t2 = await readTable(join(SAMPLES, 'sample_douyin_period2.xlsx'))
      const r1 = mapRecords(t1, getPlatform('douyin')).records
      const r2 = mapRecords(t2, getPlatform('douyin')).records
      const analysis = runAnalysis(
        makeSnapshot('p2', 'period2.xlsx', r2),
        makeSnapshot('p1', 'period1.xlsx', r1)
      )
      expect(analysis.deltas).not.toBeNull()
      expect(analysis.deltas?.videoCount).toBeDefined()
    })
  }
)
