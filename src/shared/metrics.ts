import type {
  AnalysisResult,
  Delta,
  Deltas,
  DurationBucket,
  HourStat,
  Snapshot,
  SnapshotMeta,
  Totals,
  TrendBucket,
  VideoDiff,
  VideoDiffsResult,
  VideoRecord
} from './types'

const round2 = (n: number): number => Math.round(n * 100) / 100

export function interactionsOf(r: VideoRecord): number {
  return r.likes + r.comments + r.shares + r.collects
}

export function engagementRateOf(r: VideoRecord): number {
  if (!r.plays) return 0
  return round2((interactionsOf(r) / r.plays) * 100)
}

export function computeTotals(records: VideoRecord[]): Totals {
  let plays = 0
  let likes = 0
  let comments = 0
  let shares = 0
  let collects = 0
  let follows = 0
  let hasFollows = false
  let completionSum = 0
  let completionCount = 0
  for (const r of records) {
    plays += r.plays
    likes += r.likes
    comments += r.comments
    shares += r.shares
    collects += r.collects
    if (r.followsGained != null) {
      follows += r.followsGained
      hasFollows = true
    }
    if (r.completionRate != null) {
      completionSum += r.completionRate
      completionCount++
    }
  }
  const videoCount = records.length
  return {
    videoCount,
    plays,
    likes,
    comments,
    shares,
    collects,
    followsGained: hasFollows ? follows : null,
    engagementRate: plays ? round2(((likes + comments + shares + collects) / plays) * 100) : 0,
    avgPlays: videoCount ? round2(plays / videoCount) : 0,
    completionRate: completionCount ? round2(completionSum / completionCount) : null
  }
}

function makeDelta(cur: number, prev: number): Delta {
  const value = round2(cur - prev)
  const percent = prev !== 0 ? round2(((cur - prev) / Math.abs(prev)) * 100) : null
  return { value, percent, direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat' }
}

/** 逐项对比两期整体指标，null 值字段不参与对比 */
export function computeDeltas(cur: Totals, prev: Totals): Deltas {
  const deltas: Deltas = {}
  const pairs: Array<[string, number | null, number | null]> = [
    ['videoCount', cur.videoCount, prev.videoCount],
    ['plays', cur.plays, prev.plays],
    ['avgPlays', cur.avgPlays, prev.avgPlays],
    ['engagementRate', cur.engagementRate, prev.engagementRate],
    ['likes', cur.likes, prev.likes],
    ['comments', cur.comments, prev.comments],
    ['shares', cur.shares, prev.shares],
    ['collects', cur.collects, prev.collects],
    ['followsGained', cur.followsGained, prev.followsGained],
    ['completionRate', cur.completionRate, prev.completionRate]
  ]
  for (const [key, c, p] of pairs) {
    if (c == null || p == null) continue
    deltas[key] = makeDelta(c, p)
  }
  return deltas
}

function parseTime(r: VideoRecord): Date | null {
  if (!r.publishTime) return null
  const d = new Date(r.publishTime)
  return isNaN(d.getTime()) ? null : d
}

const pad = (n: number): string => String(n).padStart(2, '0')

function bucketKey(d: Date, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  if (granularity === 'week') {
    const monday = new Date(d)
    const dow = (d.getDay() + 6) % 7
    monday.setDate(d.getDate() - dow)
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function bucketLabel(key: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') return key
  if (granularity === 'week') {
    const start = new Date(key)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return `${pad(start.getMonth() + 1)}-${pad(start.getDate())}~${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
  }
  return key.slice(5) // MM-DD
}

/** 按发布时间分桶：跨度 ≤31 天按日，≤120 天按周，更长按月 */
export function computeTrend(records: VideoRecord[]): {
  granularity: 'day' | 'week' | 'month'
  buckets: TrendBucket[]
} {
  const timed = records.map((r) => ({ r, d: parseTime(r) })).filter((x): x is { r: VideoRecord; d: Date } => x.d != null)
  if (timed.length === 0) return { granularity: 'day', buckets: [] }

  const times = timed.map((x) => x.d.getTime())
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86400000
  const granularity = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month'

  const groups = new Map<string, VideoRecord[]>()
  for (const { r, d } of timed) {
    const key = bucketKey(d, granularity)
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  const buckets = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, rs]) => {
      const totals = computeTotals(rs)
      return {
        label: bucketLabel(key, granularity),
        start: key,
        end: key,
        videoCount: totals.videoCount,
        plays: totals.plays,
        engagementRate: totals.engagementRate,
        completionRate: totals.completionRate
      }
    })
  return { granularity, buckets }
}

/** 各发布时段（0-23 点）的平均表现，用于发现最佳发布时间 */
export function computeHourStats(records: VideoRecord[]): HourStat[] {
  const groups = new Map<number, VideoRecord[]>()
  for (const r of records) {
    const d = parseTime(r)
    if (!d) continue
    const list = groups.get(d.getHours())
    if (list) list.push(r)
    else groups.set(d.getHours(), [r])
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, rs]) => {
      const totals = computeTotals(rs)
      return {
        hour,
        label: `${hour}时`,
        videoCount: totals.videoCount,
        avgPlays: totals.avgPlays,
        avgEngagementRate: totals.engagementRate
      }
    })
}

const DURATION_RANGES: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: '<15秒', min: null, max: 15 },
  { label: '15-60秒', min: 15, max: 60 },
  { label: '1-3分钟', min: 60, max: 180 },
  { label: '3分钟以上', min: 180, max: null },
  { label: '未知', min: null, max: null }
]

export function computeDurationBuckets(records: VideoRecord[]): DurationBucket[] {
  const groups = new Map<string, VideoRecord[]>()
  for (const r of records) {
    const d = r.durationSec
    const range = DURATION_RANGES.find(({ min, max }) => {
      if (d == null) return min == null && max == null
      return (min == null || d >= min) && (max == null || d < max)
    })
    if (!range) continue
    const list = groups.get(range.label)
    if (list) list.push(r)
    else groups.set(range.label, [r])
  }
  return DURATION_RANGES.filter(({ label }) => groups.has(label)).map(({ label }) => {
    const rs = groups.get(label) as VideoRecord[]
    const totals = computeTotals(rs)
    return { label, videoCount: totals.videoCount, avgPlays: totals.avgPlays, avgCompletionRate: totals.completionRate }
  })
}

export function rankRecords(records: VideoRecord[]): {
  topByPlays: VideoRecord[]
  bottomByPlays: VideoRecord[]
  topByEngagement: VideoRecord[]
  bottomByEngagement: VideoRecord[]
} {
  const byPlays = [...records].sort((a, b) => b.plays - a.plays)
  const byEngagement = [...records].sort((a, b) => engagementRateOf(b) - engagementRateOf(a))
  return {
    topByPlays: byPlays.slice(0, 5),
    bottomByPlays: [...byPlays].reverse().slice(0, 5),
    topByEngagement: byEngagement.slice(0, 5),
    bottomByEngagement: [...byEngagement].reverse().slice(0, 5)
  }
}

/** 按标题精确匹配两期视频，计算播放/互动涨跌 */
export function computeVideoDiffs(cur: VideoRecord[], prev: VideoRecord[]): VideoDiffsResult {
  const prevByTitle = new Map<string, VideoRecord>()
  for (const r of prev) prevByTitle.set(r.title.trim(), r)

  const diffs: VideoDiff[] = []
  for (const r of cur) {
    const p = prevByTitle.get(r.title.trim())
    if (!p) continue
    const playsDiff = r.plays - p.plays
    diffs.push({
      title: r.title,
      curPlays: r.plays,
      prevPlays: p.plays,
      playsDiff,
      playsDiffPercent: p.plays !== 0 ? round2((playsDiff / p.plays) * 100) : null,
      curEngagement: engagementRateOf(r),
      prevEngagement: engagementRateOf(p)
    })
  }
  diffs.sort((a, b) => b.playsDiff - a.playsDiff)
  return {
    matched: diffs.length,
    up: diffs.filter((d) => d.playsDiff > 0).slice(0, 5),
    down: diffs
      .filter((d) => d.playsDiff < 0)
      .reverse()
      .slice(0, 5)
  }
}

function toMeta(s: Snapshot): SnapshotMeta {
  const { records: _records, ...meta } = s
  void _records
  return meta
}

export function runAnalysis(snapshot: Snapshot, compare: Snapshot | null): AnalysisResult {
  const { records, ...meta } = snapshot
  const totals = computeTotals(records)
  const { topByPlays, bottomByPlays, topByEngagement, bottomByEngagement } = rankRecords(records)
  const { granularity, buckets } = computeTrend(records)
  const prevTotals = compare ? computeTotals(compare.records) : null
  return {
    snapshot: meta,
    compareSnapshot: compare ? toMeta(compare) : null,
    generatedAt: new Date().toISOString(),
    totals,
    prevTotals,
    deltas: prevTotals ? computeDeltas(totals, prevTotals) : null,
    topByPlays,
    bottomByPlays,
    topByEngagement,
    bottomByEngagement,
    videoDiffs: compare ? computeVideoDiffs(records, compare.records) : null,
    trend: buckets,
    trendGranularity: granularity,
    hourStats: computeHourStats(records),
    durationBuckets: computeDurationBuckets(records)
  }
}
