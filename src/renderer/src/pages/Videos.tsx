import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, Input, Segmented, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import type { AnalysisResult, Snapshot, VideoRecord } from '@shared/types'
import { engagementRateOf } from '@shared/metrics'
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
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<'small' | 'middle' | 'large'>('middle')

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

  const columns = [
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
  ]

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
        scroll={{ x: 1240 }}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
        rowClassName={(r) => (topIds.has(r.id) ? 'row-top' : bottomIds.has(r.id) ? 'row-bottom' : '')}
      />
      </Card>
    </div>
  )
}
