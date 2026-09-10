import { describe, expect, it } from 'vitest'
import { runAnalysis } from '../src/shared/metrics'
import { buildWeeklyDataDigest, renderWeeklyTemplate } from '../src/shared/weekly'
import type { DiagnosisResult, Snapshot, VideoRecord } from '../src/shared/types'

function rec(partial: Partial<VideoRecord>): VideoRecord {
  return {
    id: 'v0',
    title: '测试视频',
    publishTime: null,
    durationSec: null,
    plays: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    collects: 0,
    followsGained: null,
    completionRate: null,
    avgWatchSec: null,
    ...partial
  }
}

function snap(id: string, records: VideoRecord[]): Snapshot {
  return {
    id,
    platform: 'douyin',
    platformLabel: '抖音',
    account: '',
    note: '',
    fileName: `${id}.xlsx`,
    importedAt: id,
    recordCount: records.length,
    warnings: [],
    unmappedColumns: [],
    records
  }
}

const diagnosis: DiagnosisResult = {
  summary: '',
  hotPatterns: [],
  weakPatterns: [],
  titleNotes: '',
  advicePublishTime: [],
  adviceTopics: [],
  adviceActions: [],
  generatedAt: '2026-09-10T00:00:00.000Z',
  retrospective: ['上期建议已验证']
}

const cur = snap('p2', [
  rec({ id: 'a', title: '爆款A', publishTime: '2026-09-01 20:00:00', plays: 3000, likes: 60 }),
  rec({ id: 'b', title: '长尾B', publishTime: '2026-09-02 21:00:00', plays: 1200, likes: 12 })
])
const prev = snap('p1', [rec({ id: 'p', title: '爆款A', publishTime: '2026-09-01 20:00:00', plays: 1000, likes: 30 })])
const analysis = runAnalysis(cur, prev)

describe('renderWeeklyTemplate（数据模板周报）', () => {
  it('包含核心数字、环比、净增口径、Top 视频与复盘结论', () => {
    const md = renderWeeklyTemplate(analysis, diagnosis)
    expect(md).toContain('总播放 4,200（环比 +320.0%）')
    expect(md).toContain('净增口径：播放 +2,000')
    expect(md).toContain('1. 爆款A（3,000 播放）')
    expect(md).toContain('**最佳发布时段**：20时')
    expect(md).toContain('### 上期建议执行情况')
    expect(md).toContain('- 上期建议已验证')
  })

  it('无对比期时不含环比字样，周期回退到文件维度', () => {
    const md = renderWeeklyTemplate(runAnalysis(cur, null))
    expect(md).not.toContain('环比')
    expect(md).toContain('统计周期：2026-09-01')
  })
})

describe('buildWeeklyDataDigest（LLM 摘要）', () => {
  it('摘要字段完整可序列化', () => {
    const d = buildWeeklyDataDigest(analysis, diagnosis)
    expect(JSON.stringify(d)).toBeTypeOf('string')
    expect(d.account).toBe('未命名账号')
    expect(d.top[0]).toEqual({ title: '爆款A', plays: 3000 })
    expect(d.retrospective).toEqual(['上期建议已验证'])
    expect(d.deltas?.plays?.percent).toBe(320)
    expect(d.increments?.matched).toBe(1)
  })
})
