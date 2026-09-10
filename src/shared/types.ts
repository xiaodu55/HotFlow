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
  /** 账号名（同平台多账号隔离用），未填写为空串 */
  account: string
  /** 周期备注（如「8月第1周」），报告与历史列表展示 */
  note: string
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
  /** 播放量中位数（仅统计播放 >0 的视频）——平均会骗人，中位数才是真实水位 */
  medianPlays: number
  completionRate: number | null
}

/** 播放水位标准（用于内容分级） */
export interface PlayLevels {
  medianPlays: number
  avgEngagementRate: number
}

export type VideoGrade = '爆款' | '优质' | '正常' | '低效'

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
  /** 本期视频发布时间的最早/最晚日期（统计周期），无发布时间时为 null */
  periodRange: { from: string | null; to: string | null }
  /** 播放水位标准（中位数播放 + 平均互动率），样本不足时为 null */
  levels: PlayLevels | null
  /** 视频内容等级（id → 爆款/优质/正常/低效） */
  grades: Record<string, VideoGrade>
  /** 各等级条数统计 */
  gradeCounts: Record<string, number>
  /** 对比期的整体指标，无对比时为 null */
  prevTotals: Totals | null
  deltas: Deltas | null
  /** 本期净增（匹配到的同名视频累计值差求和），无对比时为 null */
  increments: Increments | null
  /** 同平台同账号、按导入时间排序的相邻快照净增序列 */
  incrementTrend: IncrementPoint[]
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

/** 本期净增口径：匹配到的同名同发布日视频，本期累计值 − 上期累计值 求和 */
export interface Increments {
  plays: number
  likes: number
  comments: number
  shares: number
  collects: number
  followsGained: number | null
  /** 匹配到的视频对数 */
  matched: number
}

/** 相邻两期快照之间的净增点（净增趋势用） */
export interface IncrementPoint {
  label: string
  importedAt: string
  plays: number
  likes: number
  followsGained: number | null
  matched: number
}

/** 标题话题/高频词统计（喂给 LLM 的选题素材） */
export interface TitleTagStat {
  tag: string
  count: number
  avgPlays: number
}

export interface TitleAnalysis {
  hashtags: TitleTagStat[]
  topWords: TitleTagStat[]
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

/** 看板「策略复盘」卡片数据：上期建议 + 本期复盘结论 */
export interface StrategyReview {
  /** 上期诊断（建议来源），无上期诊断为 null */
  previous: DiagnosisResult | null
  /** 本期诊断生成的复盘结论；尚未重新生成诊断时为空数组 */
  retrospective: string[]
  /** 上期诊断生成时间 */
  previousGeneratedAt: string | null
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
  /** 上期建议复盘（存在上期诊断时生成） */
  retrospective?: string[]
  /** 所复盘的上期诊断生成时间 */
  previousGeneratedAt?: string
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
