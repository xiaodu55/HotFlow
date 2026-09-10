import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, Input, Popover, Segmented, Space, Table, Tag, Tooltip, Typography, App } from 'antd'
import { ExportOutlined, TagsOutlined } from '@ant-design/icons'
import type { AnalysisResult, Snapshot, VideoRecord, VideoTagMap } from '@shared/types'
import { engagementRateOf, matchKeyOf } from '@shared/metrics'
import { metricTooltip } from '../metricsInfo'
import { daysSince } from '../utils'
import PageHeader from '../components/PageHeader'
import { fmtDuration, fmtNum, fmtPct, fmtTime } from '../utils'

function headWithTip(title: string, tip: string): ReactNode {
  return (
    <span>
      {title}{' '}
      <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tip}</span>}>
        <span style={{ color: 'rgba(148,163,184,0.8)', fontSize: 11, cursor: 'help' }}>?</span>
      </Tooltip>
    </span>
  )
}

interface Props {
  snapshot: Snapshot | null
  analysis: AnalysisResult | null
}

export default function VideosPage({ snapshot, analysis }: Props) {
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<'small' | 'middle' | 'large'>('middle')
  const [tagMap, setTagMap] = useState<VideoTagMap>({})

  useEffect(() => {
    void window.api
      .getVideoTags()
      .then(setTagMap)
      .catch(() => message.error('标签加载失败'))
  }, [message])

  const allTags = useMemo(() => [...new Set(Object.values(tagMap).flat())].sort(), [tagMap])

  async function updateTags(key: string, tags: string[]) {
    try {
      setTagMap(await window.api.setVideoTags(key, tags))
    } catch (err) {
      message.error(`保存标签失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 单个视频的打标气泡：已有标签可删，输入回车新增 */
  function TagEditor({ record }: { record: VideoRecord }) {
    const key = matchKeyOf(record)
    const tags = tagMap[key] ?? []
    const [draft, setDraft] = useState('')
    return (
      <Popover
        trigger="click"
        placement="bottom"
        content={
          <div style={{ width: 220 }}>
            <div style={{ marginBottom: 8 }}>
              {tags.length === 0 && (
                <span style={{ color: 'rgba(148,163,184,0.9)', fontSize: 12 }}>暂无标签，输入后回车添加</span>
              )}
              {tags.map((t) => (
                <Tag
                  key={t}
                  color="blue"
                  bordered={false}
                  closable
                  onClose={() => void updateTags(key, tags.filter((x) => x !== t))}
                >
                  {t}
                </Tag>
              ))}
            </div>
            <Input.Search
              size="small"
              placeholder="新标签，回车添加"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onSearch={(v) => {
                const t = v.trim()
                if (!t) return
                if (!tags.includes(t)) void updateTags(key, [...tags, t])
                setDraft('')
              }}
            />
          </div>
        }
      >
        <Button type="text" size="small" icon={<TagsOutlined />}>
          {tags.length > 0 ? `${tags.length}` : '打标'}
        </Button>
      </Popover>
    )
  }

  const topIds = useMemo(() => new Set((analysis?.topByPlays ?? []).map((r) => r.id)), [analysis])
  const bottomIds = useMemo(() => new Set((analysis?.bottomByPlays ?? []).map((r) => r.id)), [analysis])

  const data = useMemo(() => {
    const records = snapshot?.records ?? []
    if (!search.trim()) return records
    return records.filter((r) => r.title.includes(search.trim()))
  }, [snapshot, search])

  function exportCsv() {
    if (!snapshot) return
    const header = ['标题', '发布时间', '时长(秒)', '播放量', '点赞', '评论', '分享', '收藏', '涨粉', '完播率(%)', '平均播放时长(秒)', '互动率(%)']
    const esc = (v: string | number | null): string => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(',')]
    for (const r of snapshot.records) {
      lines.push(
        [
          esc(r.title),
          esc(r.publishTime ?? ''),
          r.durationSec ?? '',
          r.plays,
          r.likes,
          r.comments,
          r.shares,
          r.collects,
          r.followsGained ?? '',
          r.completionRate ?? '',
          r.avgWatchSec ?? '',
          engagementRateOf(r)
        ].join(',')
      )
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `HotFlow_视频明细_${snapshot.fileName.replace(/\.(xlsx|xls|csv)$/i, '')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // columns 引用 grades（analysis），memo 化避免每次渲染重建
  const columns = useMemo(() => [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string) => (
        <Typography.Text ellipsis style={{ maxWidth: 360 }}>
          {v}
        </Typography.Text>
      )
    },
    {
      title: '等级',
      key: 'grade',
      width: 84,
      filters: [
        { text: '爆款', value: '爆款' },
        { text: '优质', value: '优质' },
        { text: '正常', value: '正常' },
        { text: '低效', value: '低效' }
      ],
      onFilter: (value: unknown, r: VideoRecord) => (analysis?.grades[r.id] ?? '正常') === value,
      render: (_: unknown, r: VideoRecord) => {
        const g = analysis?.grades[r.id] ?? '正常'
        const color = g === '爆款' ? 'gold' : g === '优质' ? 'green' : g === '低效' ? 'red' : 'default'
        return <Tag color={color}>{g}</Tag>
      }
    },
    {
      title: '标签',
      key: 'tags',
      width: 170,
      filters: allTags.map((t) => ({ text: t, value: t })),
      onFilter: (value: unknown, r: VideoRecord) => (tagMap[matchKeyOf(r)] ?? []).includes(value as string),
      render: (_: unknown, r: VideoRecord) => {
        const tags = tagMap[matchKeyOf(r)] ?? []
        return (
          <Space size={4} wrap>
            {tags.map((t) => (
              <Tag key={t} color="blue" bordered={false}>
                {t}
              </Tag>
            ))}
            <TagEditor record={r} />
          </Space>
        )
      }
    },
    { title: '发布时间', dataIndex: 'publishTime', width: 140, render: fmtTime },
    {
      title: '发布至今',
      key: 'age',
      width: 92,
      sorter: (a: VideoRecord, b: VideoRecord) => (daysSince(a.publishTime) ?? -1) - (daysSince(b.publishTime) ?? -1),
      render: (_: unknown, r: VideoRecord) => {
        const d = daysSince(r.publishTime)
        return d == null ? '—' : `${d} 天`
      }
    },
    { title: '时长', dataIndex: 'durationSec', width: 90, render: fmtDuration },
    {
      title: headWithTip('播放量', metricTooltip('plays')),
      dataIndex: 'plays',
      width: 110,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => a.plays - b.plays,
      render: fmtNum
    },
    {
      title: headWithTip('互动率', metricTooltip('engagementRate')),
      key: 'engagement',
      width: 100,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => engagementRateOf(a) - engagementRateOf(b),
      render: (_: unknown, r: VideoRecord) => fmtPct(engagementRateOf(r))
    },
    {
      title: headWithTip('完播率', metricTooltip('completionRate')),
      dataIndex: 'completionRate',
      width: 100,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => (a.completionRate ?? -1) - (b.completionRate ?? -1),
      render: fmtPct
    },
    {
      title: '点赞',
      dataIndex: 'likes',
      width: 90,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => a.likes - b.likes,
      render: fmtNum
    },
    {
      title: '评论',
      dataIndex: 'comments',
      width: 90,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => a.comments - b.comments,
      render: fmtNum
    },
    {
      title: '分享',
      dataIndex: 'shares',
      width: 90,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => a.shares - b.shares,
      render: fmtNum
    },
    {
      title: '收藏',
      dataIndex: 'collects',
      width: 90,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => a.collects - b.collects,
      render: fmtNum
    }
  ], [analysis, tagMap, allTags])

  return (
    <div>
      <PageHeader
        title="视频明细"
        description={snapshot ? `${snapshot.fileName} · ${snapshot.recordCount} 条视频` : undefined}
        extra={
          <Space>
            <Tag color="green" bordered={false}>绿底 = 播放 Top5</Tag>
            <Tag color="red" bordered={false}>红底 = 播放 Bottom5</Tag>
            <Segmented
              size="small"
              value={density}
              onChange={(v) => setDensity(v as typeof density)}
              options={[
                { value: 'large', label: '宽松' },
                { value: 'middle', label: '中等' },
                { value: 'small', label: '紧凑' }
              ]}
            />
            <Input.Search
              placeholder="搜索标题"
              allowClear
              style={{ width: 200 }}
              onSearch={setSearch}
              onChange={(e) => {
                if (!e.target.value) setSearch('')
              }}
            />
            <Button icon={<ExportOutlined />} onClick={exportCsv} disabled={!snapshot}>
              导出 CSV
            </Button>
          </Space>
        }
      />
      <Card size="small" styles={{ body: { paddingTop: 12 } }}>
      <Table<VideoRecord>
        rowKey="id"
        dataSource={data}
        columns={columns}
        size={density}
        scroll={{ x: 1400 }}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
        rowClassName={(r) => (topIds.has(r.id) ? 'row-top' : bottomIds.has(r.id) ? 'row-bottom' : '')}
      />
      </Card>
    </div>
  )
}
