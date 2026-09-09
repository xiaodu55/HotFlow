import { useMemo, useState } from 'react'
import { Card, Input, Space, Table, Tag, Typography } from 'antd'
import type { AnalysisResult, Snapshot, VideoRecord } from '@shared/types'
import { engagementRateOf } from '@shared/metrics'
import { fmtDuration, fmtNum, fmtPct, fmtTime } from '../utils'

interface Props {
  snapshot: Snapshot | null
  analysis: AnalysisResult | null
}

export default function VideosPage({ snapshot, analysis }: Props) {
  const [search, setSearch] = useState('')

  const topIds = useMemo(
    () => new Set((analysis?.topByPlays ?? []).map((r) => r.id)),
    [analysis]
  )
  const bottomIds = useMemo(
    () => new Set((analysis?.bottomByPlays ?? []).map((r) => r.id)),
    [analysis]
  )

  const data = useMemo(() => {
    const records = snapshot?.records ?? []
    if (!search.trim()) return records
    return records.filter((r) => r.title.includes(search.trim()))
  }, [snapshot, search])

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string) => <Typography.Text ellipsis style={{ maxWidth: 360 }}>{v}</Typography.Text>
    },
    { title: '发布时间', dataIndex: 'publishTime', width: 140, render: fmtTime },
    { title: '时长', dataIndex: 'durationSec', width: 90, render: fmtDuration },
    {
      title: '播放量',
      dataIndex: 'plays',
      width: 110,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => a.plays - b.plays,
      render: fmtNum
    },
    {
      title: '互动率',
      key: 'engagement',
      width: 100,
      align: 'right' as const,
      sorter: (a: VideoRecord, b: VideoRecord) => engagementRateOf(a) - engagementRateOf(b),
      render: (_: unknown, r: VideoRecord) => fmtPct(engagementRateOf(r))
    },
    {
      title: '完播率',
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
    <Card
      size="small"
      title="视频明细"
      styles={{ body: { paddingTop: 12 } }}
      extra={
        <Space>
          <Tag color="green">绿底 = 播放 Top5</Tag>
          <Tag color="red">红底 = 播放 Bottom5</Tag>
          <Input.Search
            placeholder="搜索标题"
            allowClear
            style={{ width: 220 }}
            onSearch={setSearch}
            onChange={(e) => {
              if (!e.target.value) setSearch('')
            }}
          />
        </Space>
      }
    >
      <Table<VideoRecord>
        rowKey="id"
        dataSource={data}
        columns={columns}
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
        rowClassName={(r) => (topIds.has(r.id) ? 'row-top' : bottomIds.has(r.id) ? 'row-bottom' : '')}
      />
    </Card>
  )
}
