/** 标准化后的单条视频记录 —— 所有平台的数据都归一到这个结构 */
export interface VideoRecord {
  id: string
  title: string
  /** ISO 格式或 'YYYY-MM-DD HH:mm:ss'，无法解析时为 null */
  publishTime: string | null
  durationSec: number | null
  plays: number
  likes: number
  comments: number
  shares: number
  collects: number
  followsGained: number | null
  /** 完播率，百分数 0-100 */
  completionRate: number | null
  avgWatchSec: number | null
}

export interface SnapshotMeta {
  id: string
  platform: string
  platformLabel: string
  fileName: string
  importedAt: string
  recordCount: number
  warnings: string[]
  unmappedColumns: string[]
}

export interface Snapshot extends SnapshotMeta {
  records: VideoRecord[]
}

export interface Totals {
  videoCount: number
  plays: number
  likes: number
  comments: number
  shares: number
  collects: number
  followsGained: number | null
  /** (赞+评+转+藏)/播放 × 100 */
  engagementRate: number
  avgPlays: number
  completionRate: number | null
}

export type DeltaDirection = 'up' | 'down' | 'flat'

export interface Delta {
  /** 绝对差值（当前 - 上期） */
  value: number
  /** 百分比变化，基线为 0 时为 null */
  percent: number | null
  direction: DeltaDirection
}

export type Deltas = Record<string, Delta>

export interface TrendBucket {
  label: string
  start: string
  end: string
  videoCount: number
  plays: number
  engagementRate: number
  completionRate: number | null
}

export interface HourStat {
  /** 0-23 */
  hour: number
  label: string
  videoCount: number
  avgPlays: number
  avgEngagementRate: number
}

export interface DurationBucket {
  label: string
  videoCount: number
  avgPlays: number
  avgCompletionRate: number | null
}

export interface AnalysisResult {
  snapshot: SnapshotMeta
  compareSnapshot: SnapshotMeta | null
  generatedAt: string
  totals: Totals
  /** 对比期的整体指标，无对比时为 null */
  prevTotals: Totals | null
  deltas: Deltas | null
  topByPlays: VideoRecord[]
  bottomByPlays: VideoRecord[]
  topByEngagement: VideoRecord[]
  bottomByEngagement: VideoRecord[]
  /** 按标题匹配两期视频的涨跌榜，无对比时为 null */
  videoDiffs: VideoDiffsResult | null
  trend: TrendBucket[]
  trendGranularity: 'day' | 'week' | 'month'
  hourStats: HourStat[]
  durationBuckets: DurationBucket[]
}

/** 两期同名视频的涨跌对比（按标题精确匹配） */
export interface VideoDiff {
  title: string
  curPlays: number
  prevPlays: number
  playsDiff: number
  playsDiffPercent: number | null
  curEngagement: number
  prevEngagement: number
}

export interface VideoDiffsResult {
  matched: number
  /** 播放增量最大的前 5 条 */
  up: VideoDiff[]
  /** 播放跌幅最大的前 5 条 */
  down: VideoDiff[]
}

/** 导入前的列映射预检结果（只读解析，不落库） */
export interface TableInspect {
  fileName: string
  headers: string[]
  rowCount: number
  /** 标准字段 → 匹配到的列名 */
  fieldColumns: Record<string, string>
  unmappedColumns: string[]
  /** 列名 → 该列首个非空样例值 */
  samples: Record<string, string>
}

/** LLM 诊断与建议的结构化结果 */
export interface DiagnosisResult {
  summary: string
  hotPatterns: string[]
  weakPatterns: string[]
  titleNotes: string
  advicePublishTime: string[]
  adviceTopics: string[]
  adviceActions: string[]
  /** JSON 解析失败时保留原文，避免信息丢失 */
  rawText?: string
  model?: string
  generatedAt: string
  /** 诊断后的追问对话记录 */
  conversation?: Array<{ question: string; answer: string }>
}

export type LlmProviderId = 'deepseek' | 'zhipu' | 'dashscope' | 'custom'

export interface LlmConfig {
  provider: LlmProviderId
  baseURL: string
  apiKey: string
  model: string
}

export interface AppSettings {
  llm: LlmConfig
  windowBounds?: { x: number; y: number; width: number; height: number }
}

export interface ImportOutcome {
  snapshot: Snapshot
}
