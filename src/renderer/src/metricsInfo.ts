/**
 * 指标口径说明字典：KPI 卡、表格列头、图表标题的悬停提示统一从这里取。
 * formula 展示计算方式，interpret 是解读参考。
 */
export interface MetricInfo {
  name: string
  formula: string
  interpret?: string
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  plays: {
    name: '播放量',
    formula: '平台后台导出的累计播放次数',
    interpret: '包含历史存量，不是"本期新增"'
  },
  likes: {
    name: '点赞',
    formula: '平台导出的累计点赞数'
  },
  comments: {
    name: '评论',
    formula: '平台导出的累计评论数'
  },
  shares: {
    name: '转发 / 分享',
    formula: '平台导出的累计分享（转发）数'
  },
  collects: {
    name: '收藏',
    formula: '平台导出的累计收藏数'
  },
  followsGained: {
    name: '涨粉',
    formula: '该视频带来的新增粉丝数（平台口径）'
  },
  completionRate: {
    name: '完播率',
    formula: '完整看完视频的观众占比（平台口径）',
    interpret: '反映内容是否留得住人，越高越好'
  },
  avgWatchSec: {
    name: '平均播放时长',
    formula: '观众平均观看秒数（平台口径）',
    interpret: '越长说明内容留人能力越强'
  },
  engagementRate: {
    name: '互动率',
    formula: '(点赞 + 评论 + 转发 + 收藏) ÷ 播放量 × 100%',
    interpret: '看的人里有多少愿意互动，是内容质量核心指标；一般 3%~5% 及格，8% 以上很不错'
  },
  avgPlays: {
    name: '篇均播放',
    formula: '总播放量 ÷ 视频条数',
    interpret: '平均每条视频拿到的播放，反映账号分发基本盘；跨期对比比总播放更公平（不受条数影响）'
  },
  videoCount: {
    name: '视频总数',
    formula: '本期导入表格中的视频条数'
  },
  incPlays: {
    name: '本期净增播放',
    formula: '同名同发布日视频：本期累计播放 − 上期累计播放，求和',
    interpret: '剔除历史存量后的"本期真实表现"，比总播放更接近运营周报口径'
  },
  incLikes: {
    name: '本期净增点赞',
    formula: '同名同发布日视频：本期累计点赞 − 上期累计点赞，求和'
  },
  incFollows: {
    name: '本期净增涨粉',
    formula: '同名同发布日视频：本期涨粉 − 上期涨粉，求和'
  },
  delta: {
    name: '对比上期（环比）',
    formula: '当前快照 vs 对比期的整体指标百分比变化',
    interpret: '累计口径的对比；想看"本期真实表现"请看净增卡'
  },
  videoDiffs: {
    name: '涨跌榜',
    formula: '按「标题 + 发布日」匹配两期都出现的视频，比较播放量差值',
    interpret: '同名但发布日不同的视频（系列重发）不会被误配'
  },
  trendChart: {
    name: '发布趋势',
    formula: '按视频发布时间分桶：跨度 ≤31 天按日、≤120 天按周、更长按月',
    interpret: '回答"哪段时间发的内容表现好"'
  },
  hourChart: {
    name: '发布时段 × 平均表现',
    formula: '按发布小时（0-23 点）分组，统计篇均播放与加权互动率',
    interpret: '帮你找到适合自己账号的发布时间'
  },
  durationChart: {
    name: '视频时长 × 平均表现',
    formula: '按时长分桶（<15秒 / 15-60秒 / 1-3分钟 / 3分钟以上），统计平均完播率与篇均播放',
    interpret: '帮你判断多长的视频更适合账号'
  },
  incrementTrend: {
    name: '净增趋势',
    formula: '同账号相邻两次导入之间，同名视频累计差求和',
    interpret: '导入越频繁，曲线越接近账号的真实增长节奏'
  }
}

/** 组合 tooltip 文案：名称 + 公式 + 解读 */
export function metricTooltip(key: keyof typeof METRIC_INFO): string {
  const info = METRIC_INFO[key]
  if (!info) return ''
  const lines = [`${info.name} = ${info.formula}`]
  if (info.interpret) lines.push(`💡 ${info.interpret}`)
  return lines.join('\n')
}
