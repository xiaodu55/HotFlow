import { describe, expect, it } from 'vitest'
import { runAnalysis } from '../src/shared/metrics'
import type { Snapshot, VideoRecord } from '../src/shared/types'
import { buildReportHtml, deltaTableHtml } from '../src/main/report'

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

describe('deltaTableHtml（两期对比明细表）', () => {
  it('中文指标名能正确映射到英文 delta 键，显示方向与幅度', () => {
    const prev = snap('p1', [rec({ id: 'a', plays: 1000, likes: 50, comments: 40 })])
    const cur = snap('p2', [rec({ id: 'b', plays: 3000, likes: 100, comments: 10 })])
    const html = deltaTableHtml(runAnalysis(cur, prev))
    expect(html).toContain('总播放')
    expect(html).toContain('class="delta up"')
    expect(html).toContain('class="delta down"')
    // 播放 1000→3000 = +200%，评论 40→10 = -75%
    expect(html).toContain('200.0%')
    expect(html).toContain('75.0%')
  })
  it('无对比期时返回空串', () => {
    expect(deltaTableHtml(runAnalysis(snap('p1', [rec({ plays: 10 })]), null))).toBe('')
  })
  it('完整报告包含对比明细表', () => {
    const prev = snap('p1', [rec({ id: 'a', plays: 1000 })])
    const cur = snap('p2', [rec({ id: 'b', plays: 2000 })])
    const html = buildReportHtml(runAnalysis(cur, prev), null)
    expect(html).toContain('两期对比明细')
    expect(html).toContain('100.0%')
  })
  it('图表库不可用时渲染占位提示而非空白', () => {
    const html = buildReportHtml(runAnalysis(snap('p1', [rec({ plays: 10 })]), null), null)
    expect(html).toContain('chart-fallback')
    expect(html).toContain('联网后重新打开本报告')
  })
})
