/**
 * 平台导出表格 → 标准字段的列映射配置。
 * 匹配规则（在 ingest 中实现）：先整列名精确匹配，再子串包含匹配；
 * 字段按 platforms.ts 中 fieldsOrder 的顺序消费，每个列只归一个字段，
 * 因此「平均播放时长」这类长列名会先于「播放」被正确认领。
 */
export type StandardField =
  | 'title'
  | 'publishTime'
  | 'durationSec'
  | 'plays'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'collects'
  | 'followsGained'
  | 'completionRate'
  | 'avgWatchSec'

export interface PlatformDef {
  id: string
  label: string
  description: string
  columns: Partial<Record<StandardField, string[]>>
}

/** 字段匹配优先级：长名/易冲突的字段靠前，避免「播放」抢走「平均播放时长」 */
export const FIELD_MATCH_ORDER: StandardField[] = [
  'title',
  'publishTime',
  'durationSec',
  'avgWatchSec',
  'completionRate',
  'followsGained',
  'collects',
  'shares',
  'comments',
  'likes',
  'plays'
]

export const FIELD_LABELS: Record<StandardField, string> = {
  title: '标题',
  publishTime: '发布时间',
  durationSec: '时长',
  plays: '播放量',
  likes: '点赞',
  comments: '评论',
  shares: '转发/分享',
  collects: '收藏',
  followsGained: '涨粉',
  completionRate: '完播率',
  avgWatchSec: '平均播放时长'
}

const douyinColumns: Partial<Record<StandardField, string[]>> = {
  title: ['作品名称', '作品标题', '标题', '视频标题', '作品名', '视频名称'],
  publishTime: ['发布时间', '创建时间', '发表时间', '上传时间'],
  durationSec: ['时长', '视频时长', '作品时长', '时长(秒)', '时长（秒）', '视频长度'],
  avgWatchSec: ['平均播放时长', '人均播放时长', '平均观看时长', '平均播放时长(秒)'],
  completionRate: ['完播率', '完整播放率', '完播率(%)', '完播率（%）'],
  followsGained: ['涨粉数', '涨粉量', '涨粉', '新增粉丝数', '新增粉丝'],
  collects: ['收藏量', '收藏数', '收藏'],
  shares: ['分享量', '分享数', '转发量', '转发数', '分享', '转发'],
  comments: ['评论量', '评论数', '评论'],
  likes: ['点赞量', '点赞数', '点赞', '获赞'],
  plays: ['播放量', '播放次数', '播放数', '播放']
}

const bilibiliColumns: Partial<Record<StandardField, string[]>> = {
  title: ['稿件标题', '视频标题', '标题'],
  publishTime: ['发布时间', '稿件发布时间'],
  durationSec: ['时长', '视频时长', '稿件时长'],
  followsGained: ['涨粉'],
  collects: ['收藏'],
  shares: ['分享'],
  comments: ['评论'],
  likes: ['点赞', '获赞'],
  plays: ['播放']
}

const xiaohongshuColumns: Partial<Record<StandardField, string[]>> = {
  title: ['笔记标题', '标题'],
  publishTime: ['发布时间'],
  durationSec: ['时长'],
  followsGained: ['新增粉丝', '涨粉'],
  collects: ['收藏'],
  shares: ['分享'],
  comments: ['评论', '留言'],
  likes: ['点赞'],
  plays: ['观看', '阅读', '播放']
}

const channelsColumns: Partial<Record<StandardField, string[]>> = {
  title: ['作品标题', '视频标题', '标题'],
  publishTime: ['发表时间', '发布时间'],
  durationSec: ['时长', '视频时长'],
  completionRate: ['完播'],
  followsGained: ['涨粉', '新增关注'],
  collects: ['收藏'],
  shares: ['转发', '分享'],
  comments: ['评论', '留言'],
  likes: ['点赞', '喜欢'],
  plays: ['播放']
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: 'douyin',
    label: '抖音',
    description: '适配抖音创作者中心导出的作品数据表',
    columns: douyinColumns
  },
  {
    id: 'bilibili',
    label: 'B站（哔哩哔哩）',
    description: '适配B站创作中心「稿件数据」导出；弹幕、投币等列暂不参与统计，会在导入时提示',
    columns: bilibiliColumns
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    description: '适配小红书创作者中心导出的笔记数据表；观看量/阅读量计为播放量',
    columns: xiaohongshuColumns
  },
  {
    id: 'channels',
    label: '视频号（微信）',
    description: '适配微信视频号助手导出的作品数据表',
    columns: channelsColumns
  },
  {
    id: 'generic',
    label: '通用（自动识别列名）',
    description: '按关键词自动匹配列名，适用于大多数平台导出表格',
    columns: {
      title: ['标题', '名称', '作品', '视频'],
      publishTime: ['发布时间', '时间', '日期'],
      durationSec: ['时长', '长度'],
      avgWatchSec: ['平均播放时长', '平均观看', '人均播放'],
      completionRate: ['完播率', '完整播放'],
      followsGained: ['涨粉', '新增粉丝'],
      collects: ['收藏'],
      shares: ['分享', '转发'],
      comments: ['评论', '留言'],
      likes: ['点赞', '获赞', '赞'],
      plays: ['播放', '观看']
    }
  }
]

export function getPlatform(id: string): PlatformDef {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1]
}
