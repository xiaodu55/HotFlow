import type {
  AnalysisResult,
  Delta,
  Deltas,
  DurationBucket,
  HourStat,
  Increments,
  IncrementPoint,
  PlayLevels,
  Snapshot,
  SnapshotMeta,
  TitleAnalysis,
  TitleTagStat,
  Totals,
  TrendBucket,
  VideoDiff,
  VideoDiffsResult,
  VideoGrade,
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
    medianPlays: medianPlaysOf(records),
    completionRate: completionCount ? round2(completionSum / completionCount) : null
  }
}

/** 播放量中位数：只统计播放 >0 的视频（0 播放通常是未分发，不算水位样本） */
export function medianPlaysOf(records: VideoRecord[]): number {
  const list = records.map((r) => r.plays).filter((p) => p > 0).sort((a, b) => a - b)
  if (list.length === 0) return 0
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : round2((list[mid - 1] + list[mid]) / 2)
}

/** 播放水位标准：中位数播放 + 整体互动率（样本 <4 条时不构成水位） */
export function computeLevels(records: VideoRecord[]): PlayLevels | null {
  if (records.length < 4) return null
  const median = medianPlaysOf(records)
  if (median <= 0) return null
  return { medianPlays: median, avgEngagementRate: computeTotals(records).engagementRate }
}

/** 内容分级：爆款 = 播放 ≥ 中位数×2 且互动率高于平均；低效 = 播放 < 中位数÷2 */
export function gradeVideo(r: VideoRecord, levels: PlayLevels | null): VideoGrade {
  if (!levels || levels.medianPlays <= 0 || r.plays <= 0) return '正常'
  if (r.plays >= levels.medianPlays * 2) {
    return engagementRateOf(r) > levels.avgEngagementRate ? '爆款' : '优质'
  }
  if (r.plays < levels.medianPlays / 2) return '低效'
  return '正常'
}

/** 全量分级（id → 等级）+ 各等级条数 */
export function gradeAll(
  records: VideoRecord[],
  levels: PlayLevels | null
): { grades: Record<string, VideoGrade>; gradeCounts: Record<string, number> } {
  const grades: Record<string, VideoGrade> = {}
  const gradeCounts: Record<string, number> = { 爆款: 0, 优质: 0, 正常: 0, 低效: 0 }
  for (const r of records) {
    const g = gradeVideo(r, levels)
    grades[r.id] = g
    gradeCounts[g] = (gradeCounts[g] ?? 0) + 1
  }
  return { grades, gradeCounts }
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

/** 日期键（YYYY-MM-DD）加 N 天，本地时区构造避免 UTC 解析偏移 */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
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
        end: granularity === 'week' ? addDays(key, 6) : key,
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

/** 视频身份复合键：同名但发布日不同视为不同视频，避免系列视频互配 */
export function matchKeyOf(r: VideoRecord): string {
  return `${r.title.trim()}|${r.publishTime ? r.publishTime.slice(0, 10) : ''}`
}

/** 本期净增：匹配到的同名同发布日视频，本期累计值 − 上期累计值 求和 */
export function computeIncrements(cur: VideoRecord[], prev: VideoRecord[]): Increments | null {
  const prevByKey = new Map<string, VideoRecord>()
  for (const r of prev) prevByKey.set(matchKeyOf(r), r)

  let plays = 0
  let likes = 0
  let comments = 0
  let shares = 0
  let collects = 0
  let follows = 0
  let hasFollows = false
  let matched = 0

  for (const r of cur) {
    const p = prevByKey.get(matchKeyOf(r))
    if (!p) continue
    matched++
    plays += r.plays - p.plays
    likes += r.likes - p.likes
    comments += r.comments - p.comments
    shares += r.shares - p.shares
    collects += r.collects - p.collects
    if (r.followsGained != null && p.followsGained != null) {
      follows += r.followsGained - p.followsGained
      hasFollows = true
    }
  }
  if (matched === 0) return null
  return {
    plays,
    likes,
    comments,
    shares,
    collects,
    followsGained: hasFollows ? follows : null,
    matched
  }
}

/** 同平台同账号、按导入时间升序的快照序列 → 相邻两期净增点序列 */
export function computeIncrementTrend(chain: Snapshot[]): IncrementPoint[] {
  const ordered = [...chain].sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1))
  const points: IncrementPoint[] = []
  for (let i = 1; i < ordered.length; i++) {
    const inc = computeIncrements(ordered[i].records, ordered[i - 1].records)
    if (!inc) continue
    const at = ordered[i].importedAt
    points.push({
      label: `${at.slice(5, 10)} ${at.slice(11, 16)}`,
      importedAt: at,
      plays: inc.plays,
      likes: inc.likes,
      followsGained: inc.followsGained,
      matched: inc.matched
    })
  }
  return points
}

const TAG_RE = /#([^#\s]{1,24})(?:#)?/g

/** 中文常用停用词（单双字虚词，用于过滤 n-gram 噪音） */
const STOP_WORDS = new Set([
  '我们', '你们', '他们', '她们', '它们', '这个', '那个', '什么', '怎么', '这样', '那样',
  '一个', '一下', '没有', '就是', '还是', '可以', '不是', '大家', '自己', '因为', '所以',
  '但是', '如果', '视频', '时候', '现在', '知道', '觉得', '真的', '一下', '今天', '明天',
  '的', '了', '是', '在', '和', '有', '个', '也', '就', '都', '要', '会', '你', '我',
  '他', '她', '它', '啊', '吧', '呢', '吗', '哦', '嗯', '这', '那', '被', '把', '让',
  '上', '下', '来', '去', '说', '好', '很', '太', '不', '没'
])

function isNoise(text: string): boolean {
  if (STOP_WORDS.has(text)) return true
  // 不含任何文字（字母/汉字）即为纯数字/符号噪音；注意 JS 的 \w 不含中文，须用 \p{L}
  if (!/\p{L}/u.test(text)) return true
  return false
}

/** 标题话题与高频词统计，作为选题素材传给 LLM */
export function analyzeTitles(records: VideoRecord[]): TitleAnalysis {
  const tagMap = new Map<string, { count: number; plays: number }>()
  const gramMap = new Map<string, { count: number; plays: number }>()

  for (const r of records) {
    const title = r.title
    for (const m of title.matchAll(TAG_RE)) {
      const tag = m[1].replace(/\[(话题|视频)\]$/i, '').trim()
      if (tag.length < 2 || isNoise(tag)) continue
      const cur = tagMap.get(tag)
      if (cur) {
        cur.count++
        cur.plays += r.plays
      } else {
        tagMap.set(tag, { count: 1, plays: r.plays })
      }
    }

    const stripped = title.replace(TAG_RE, ' ').replace(/[^\u4e00-\u9fa5a-zA-Z]+/g, ' ').trim()
    for (const seg of stripped.split(/\s+/)) {
      if (seg.length < 2) continue
      const seen = new Set<string>()
      for (const n of [2, 3, 4]) {
        for (let i = 0; i + n <= seg.length; i++) {
          const gram = seg.slice(i, i + n)
          if (isNoise(gram) || seen.has(gram)) continue
          seen.add(gram)
          const cur = gramMap.get(gram)
          if (cur) {
            cur.count++
            cur.plays += r.plays
          } else {
            gramMap.set(gram, { count: 1, plays: r.plays })
          }
        }
      }
    }
  }

  const toStats = (m: Map<string, { count: number; plays: number }>, minCount: number, top: number): TitleTagStat[] =>
    [...m.entries()]
      .filter(([, v]) => v.count >= minCount)
      .map(([tag, v]) => ({ tag, count: v.count, avgPlays: Math.round(v.plays / v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, top)

  return {
    hashtags: toStats(tagMap, 1, 8),
    topWords: toStats(gramMap, 2, 12)
  }
}

/** 脏数据检测：返回人话警告（最多 10 条） */
export function findSuspicious(records: VideoRecord[]): string[] {
  const issues: string[] = []
  for (const r of records) {
    if (r.completionRate != null && r.completionRate > 100) {
      issues.push(`「${r.title}」完播率 ${r.completionRate}% 超过 100%，请核对导出数据`)
    }
    if (r.plays === 0 && (r.likes > 0 || r.comments > 0)) {
      issues.push(`「${r.title}」播放量为 0 但有点赞/评论，播放量列可能未导出`)
    }
    if (r.plays > 0 && r.likes > r.plays) {
      issues.push(`「${r.title}」点赞数（${r.likes}）超过播放量（${r.plays}），请核对数据`)
    }
    if (issues.length >= 10) break
  }
  return issues
}

function toMeta(s: Snapshot): SnapshotMeta {
  const { records: _records, ...meta } = s
  void _records
  return meta
}

/** 本期视频发布时间范围（统计周期），无发布时间时为 null */
export function computePeriodRange(records: VideoRecord[]): { from: string | null; to: string | null } {
  const days = records.map((r) => r.publishTime?.slice(0, 10)).filter((d): d is string => Boolean(d))
  if (days.length === 0) return { from: null, to: null }
  const sorted = [...days].sort()
  return { from: sorted[0], to: sorted[sorted.length - 1] }
}

/** 按复合键（标题+发布日）匹配两期视频，计算播放/互动涨跌 */
export function computeVideoDiffs(cur: VideoRecord[], prev: VideoRecord[]): VideoDiffsResult {
  const prevByKey = new Map<string, VideoRecord>()
  for (const r of prev) prevByKey.set(matchKeyOf(r), r)

  const diffs: VideoDiff[] = []
  for (const r of cur) {
    const p = prevByKey.get(matchKeyOf(r))
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

export function runAnalysis(
  snapshot: Snapshot,
  compare: Snapshot | null,
  incrementTrend: IncrementPoint[] = []
): AnalysisResult {
  const { records, ...meta } = snapshot
  const totals = computeTotals(records)
  const { topByPlays, bottomByPlays, topByEngagement, bottomByEngagement } = rankRecords(records)
  const { granularity, buckets } = computeTrend(records)
  const prevTotals = compare ? computeTotals(compare.records) : null
  const levels = computeLevels(records)
  const { grades, gradeCounts } = gradeAll(records, levels)
  return {
    snapshot: meta,
    compareSnapshot: compare ? toMeta(compare) : null,
    generatedAt: new Date().toISOString(),
    totals,
    periodRange: computePeriodRange(records),
    levels,
    grades,
    gradeCounts,
    prevTotals,
    deltas: prevTotals ? computeDeltas(totals, prevTotals) : null,
    increments: compare ? computeIncrements(records, compare.records) : null,
    incrementTrend,
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
