import { describe, expect, it } from 'vitest'
import {
  computeDeltas,
  computeHourStats,
  computeIncrements,
  computeIncrementTrend,
  computeTotals,
  computeTrend,
  computeVideoDiffs,
  analyzeTitles,
  engagementRateOf,
  findSuspicious,
  runAnalysis
} from '../src/shared/metrics'
import { matchColumns } from '../src/shared/normalize'
import { getPlatform } from '../src/shared/platforms'
import type { Snapshot, VideoRecord } from '../src/shared/types'

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

describe('computeTotals', () => {
  it('汇总与互动率计算', () => {
    const totals = computeTotals([
      rec({ plays: 1000, likes: 50, comments: 20, shares: 10, collects: 20, followsGained: 3, completionRate: 40 }),
      rec({ plays: 3000, likes: 150, comments: 30, shares: 20, collects: 0, followsGained: null, completionRate: 60 })
    ])
    expect(totals.videoCount).toBe(2)
    expect(totals.plays).toBe(4000)
    expect(totals.likes).toBe(200)
    expect(totals.engagementRate).toBe(7.5) // (200+50+30+20)/4000 = 7.5%
    expect(totals.avgPlays).toBe(2000)
    expect(totals.followsGained).toBe(3)
    expect(totals.completionRate).toBe(50)
  })
  it('全部缺涨粉时为 null', () => {
    const totals = computeTotals([rec({ plays: 100 })])
    expect(totals.followsGained).toBeNull()
  })
})

describe('engagementRateOf', () => {
  it('播放为 0 时不产生 NaN', () => {
    expect(engagementRateOf(rec({ plays: 0, likes: 10 }))).toBe(0)
  })
})

describe('computeDeltas', () => {
  it('计算差值与方向', () => {
    const cur = computeTotals([rec({ plays: 2000 })])
    const prev = computeTotals([rec({ plays: 1000 })])
    const d = computeDeltas(cur, prev)
    expect(d.plays.value).toBe(1000)
    expect(d.plays.percent).toBe(100)
    expect(d.plays.direction).toBe('up')
  })
  it('基线为 0 时 percent 为 null', () => {
    const cur = computeTotals([rec({ plays: 100 })])
    const prev = computeTotals([rec({ plays: 0 })])
    const d = computeDeltas(cur, prev)
    expect(d.plays.percent).toBeNull()
    expect(d.plays.direction).toBe('up')
  })
})

describe('computeTrend', () => {
  it('跨度 31 天内按日分桶', () => {
    const { granularity, buckets } = computeTrend([
      rec({ publishTime: '2026-08-01 10:00:00', plays: 100 }),
      rec({ publishTime: '2026-08-01 20:00:00', plays: 300 }),
      rec({ publishTime: '2026-08-03 12:00:00', plays: 200 })
    ])
    expect(granularity).toBe('day')
    expect(buckets.length).toBe(2)
    expect(buckets[0].plays).toBe(400)
    expect(buckets[0].videoCount).toBe(2)
  })
  it('跨度大于 120 天按月分桶', () => {
    const { granularity, buckets } = computeTrend([
      rec({ publishTime: '2026-01-01 10:00:00', plays: 100 }),
      rec({ publishTime: '2026-06-01 10:00:00', plays: 100 })
    ])
    expect(granularity).toBe('month')
    expect(buckets.map((b) => b.label)).toEqual(['2026-01', '2026-06'])
  })
})

describe('computeHourStats', () => {
  it('按时段聚合平均播放', () => {
    const stats = computeHourStats([
      rec({ publishTime: '2026-08-01 20:00:00', plays: 1000, likes: 10 }),
      rec({ publishTime: '2026-08-02 20:30:00', plays: 3000, likes: 30 }),
      rec({ publishTime: '2026-08-03 08:00:00', plays: 500, likes: 5 })
    ])
    expect(stats.length).toBe(2)
    expect(stats[0].hour).toBe(8)
    expect(stats[1].hour).toBe(20)
    expect(stats[1].avgPlays).toBe(2000)
  })
})

describe('matchColumns', () => {
  it('抖音导出列名映射，平均播放时长不被播放量抢占', () => {
    const { fieldColumns } = matchColumns(
      ['作品名称', '发布时间', '视频时长(秒)', '播放次数', '点赞数', '评论数', '转发数', '收藏量', '涨粉数', '完播率(%)', '平均播放时长(秒)'],
      getPlatform('douyin')
    )
    expect(fieldColumns.title).toBe('作品名称')
    expect(fieldColumns.plays).toBe('播放次数')
    expect(fieldColumns.durationSec).toBe('视频时长(秒)')
    expect(fieldColumns.avgWatchSec).toBe('平均播放时长(秒)')
    expect(fieldColumns.completionRate).toBe('完播率(%)')
    expect(fieldColumns.shares).toBe('转发数')
  })
  it('通用平台按关键词匹配', () => {
    const { fieldColumns, unmappedColumns } = matchColumns(
      ['视频名字', '发布日期', '观看人数', '赞', '留言'],
      getPlatform('generic')
    )
    expect(fieldColumns.title).toBe('视频名字')
    expect(fieldColumns.plays).toBe('观看人数')
    expect(fieldColumns.likes).toBe('赞')
    expect(fieldColumns.comments).toBe('留言')
    expect(unmappedColumns).toEqual([])
  })
})

describe('computeVideoDiffs', () => {
  it('按标题匹配两期并计算涨跌', () => {
    const cur = [
      rec({ title: '爆款A', plays: 2000, likes: 60, comments: 20 }),
      rec({ title: '爆款B', plays: 500, likes: 10 }),
      rec({ title: '新视频C', plays: 99999 })
    ]
    const prev = [
      rec({ title: '爆款A', plays: 1000, likes: 40, comments: 10 }),
      rec({ title: '爆款B', plays: 800, likes: 12 })
    ]
    const result = computeVideoDiffs(cur, prev)
    expect(result.matched).toBe(2)
    expect(result.up[0].title).toBe('爆款A')
    expect(result.up[0].playsDiff).toBe(1000)
    expect(result.up[0].playsDiffPercent).toBe(100)
    expect(result.down[0].title).toBe('爆款B')
    expect(result.down[0].playsDiff).toBe(-300)
  })
  it('同名但发布日不同不误配（系列视频）', () => {
    const result = computeVideoDiffs(
      [rec({ title: '期末复习（上集）', publishTime: '2026-08-01 10:00:00', plays: 9000 })],
      [rec({ title: '期末复习（上集）', publishTime: '2026-07-01 10:00:00', plays: 100 })]
    )
    expect(result.matched).toBe(0)
    expect(result.up).toHaveLength(0)
  })
  it('同名同发布日正常匹配', () => {
    const result = computeVideoDiffs(
      [rec({ title: '爆款A', publishTime: '2026-08-01 10:00:00', plays: 2000 })],
      [rec({ title: '爆款A', publishTime: '2026-08-01 10:00:00', plays: 1000 })]
    )
    expect(result.matched).toBe(1)
    expect(result.up[0].playsDiff).toBe(1000)
  })
  it('上期播放为 0 时百分比置空', () => {
    const result = computeVideoDiffs(
      [rec({ title: 'X', plays: 100 })],
      [rec({ title: 'X', plays: 0 })]
    )
    expect(result.up[0].playsDiffPercent).toBeNull()
  })
})

describe('computeIncrements', () => {
  it('净增口径 = 同名视频累计差求和', () => {
    const cur = [
      rec({ title: 'A', publishTime: '2026-08-01', plays: 3000, likes: 90, followsGained: 10 }),
      rec({ title: 'B', publishTime: '2026-08-02', plays: 500 })
    ]
    const prev = [
      rec({ title: 'A', publishTime: '2026-08-01', plays: 1000, likes: 30, followsGained: 4 }),
      rec({ title: 'C', publishTime: '2026-08-02', plays: 5000 })
    ]
    const inc = computeIncrements(cur, prev)
    expect(inc).not.toBeNull()
    expect(inc.matched).toBe(1)
    expect(inc.plays).toBe(2000)
    expect(inc.likes).toBe(60)
    expect(inc.followsGained).toBe(6)
  })
  it('无匹配时返回 null', () => {
    expect(computeIncrements([rec({ title: 'X', plays: 1 })], [rec({ title: 'Y', plays: 1 })])).toBeNull()
  })
})

describe('computeIncrementTrend', () => {
  it('相邻快照序列生成净增点', () => {
    const snap = (id: string, records: VideoRecord[]): Snapshot => ({
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
    })
    const chain = [
      snap('1', [rec({ title: 'A', publishTime: '2026-07-01', plays: 1000 })]),
      snap('2', [rec({ title: 'A', publishTime: '2026-07-01', plays: 2500 })]),
      snap('3', [rec({ title: 'A', publishTime: '2026-07-01', plays: 5000 })])
    ]
    const trend = computeIncrementTrend(chain)
    expect(trend).toHaveLength(2)
    expect(trend[0].plays).toBe(1500)
    expect(trend[1].plays).toBe(2500)
  })
})

describe('analyzeTitles', () => {
  it('提取话题标签并计算平均播放', () => {
    const analysis = analyzeTitles([
      rec({ title: '宿舍开箱 #校园生活 #开箱', plays: 10000 }),
      rec({ title: '食堂测评 #校园生活', plays: 20000 })
    ])
    const tag = analysis.hashtags.find((t) => t.tag === '校园生活')
    expect(tag).toBeDefined()
    expect(tag.count).toBe(2)
    expect(tag.avgPlays).toBe(15000)
    expect(analysis.hashtags.some((t) => t.tag === '开箱')).toBe(true)
  })
  it('高频词过滤停用词与单字', () => {
    const analysis = analyzeTitles([
      rec({ title: '期末复习日记', plays: 1000 }),
      rec({ title: '期末复习vlog', plays: 1000 }),
      rec({ title: '期末复习指南', plays: 1000 })
    ])
    const word = analysis.topWords.find((w) => w.tag === '期末复习')
    expect(word).toBeDefined()
    expect(word.count).toBe(3)
    expect(analysis.topWords.every((w) => !['的', '了', '日记'].includes(w.tag))).toBe(true)
  })
})

describe('findSuspicious', () => {
  it('检测完播率超 100、播放 0 有点赞、点赞超播放', () => {
    const issues = findSuspicious([
      rec({ title: 'A', completionRate: 120 }),
      rec({ title: 'B', plays: 0, likes: 10 }),
      rec({ title: 'C', plays: 100, likes: 200 }),
      rec({ title: 'D', plays: 100, likes: 10 })
    ])
    expect(issues).toHaveLength(3)
    expect(issues[0]).toContain('A')
    expect(issues[1]).toContain('B')
    expect(issues[2]).toContain('C')
  })
  it('正常数据无警告', () => {
    expect(findSuspicious([rec({ title: 'A', plays: 100, likes: 5, completionRate: 40 })])).toHaveLength(0)
  })
})

describe('runAnalysis', () => {
  it('生成完整分析结果并支持环比', () => {
    const snap = (id: string, records: VideoRecord[]): Snapshot => ({
      id,
      platform: 'douyin',
      platformLabel: '抖音',
      fileName: `${id}.xlsx`,
      importedAt: id,
      recordCount: records.length,
      warnings: [],
      unmappedColumns: [],
      records
    })
    const prev = snap('p1', [
      rec({ id: 'a', publishTime: '2026-07-10 20:00:00', plays: 1000, likes: 50, comments: 10, durationSec: 30 })
    ])
    const cur = snap('p2', [
      rec({ id: 'b', publishTime: '2026-08-10 20:00:00', plays: 2000, likes: 80, comments: 20, durationSec: 45, completionRate: 55 })
    ])
    const result = runAnalysis(cur, prev)
    expect(result.totals.plays).toBe(2000)
    expect(result.deltas?.plays.percent).toBe(100)
    expect(result.trend.length).toBe(1)
    expect(result.durationBuckets[0].label).toBe('15-60秒')
    expect(result.snapshot.fileName).toBe('p2.xlsx')
    expect(result.compareSnapshot?.fileName).toBe('p1.xlsx')
  })
})
