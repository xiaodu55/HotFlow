/** 看板的列表型卡片：指标卡标题、Top/Bottom 视频列表、两期涨跌榜 */
import type { ReactNode } from 'react'
import { Button, Card, Empty, List, Space, Tooltip } from 'antd'
import { DownloadOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import type { VideoDiff, VideoRecord } from '@shared/types'
import { engagementRateOf } from '@shared/metrics'
import { METRIC_INFO } from '../metricsInfo'
import { MetricTipByKey } from '../components/MetricTip'
import { fmtNum, fmtPct, fmtTime } from '../utils'

/** 卡片标题 + 口径说明图标 */
export function MetricTitle({ tipKey, text }: { tipKey: keyof typeof METRIC_INFO; text: string }): ReactNode {
  return (
    <span>
      {text}{' '}
      <Tooltip title={<MetricTipByKey k={tipKey} />}>
        <QuestionCircleOutlined style={{ color: 'rgba(148,163,184,0.8)', fontSize: 12 }} />
      </Tooltip>
    </span>
  )
}

export function VideoList({ title, records, highlight }: { title: string; records: VideoRecord[]; highlight: string }) {
  return (
    <Card size="small" title={title} styles={{ body: { paddingTop: 0 } }}>
      <List<VideoRecord>
        size="small"
        dataSource={records}
        renderItem={(r) => (
          <List.Item>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
              <div style={{ color: 'rgba(148,163,184,0.85)', fontSize: 12 }}>{fmtTime(r.publishTime)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, color: highlight }}>{fmtNum(r.plays)}</div>
              <div style={{ color: 'rgba(148,163,184,0.85)', fontSize: 12 }}>互动率 {fmtPct(engagementRateOf(r))}</div>
            </div>
          </List.Item>
        )}
      />
    </Card>
  )
}

export function DiffList({
  title,
  items,
  up,
  onExport
}: {
  title: string
  items: VideoDiff[]
  up: boolean
  onExport?: () => void
}) {
  const color = up ? '#34d399' : '#f87171'
  return (
    <Card
      size="small"
      title={<span style={{ color }}>{title}</span>}
      styles={{ body: { paddingTop: 0 } }}
      extra={
        <Space size={4}>
          <Tooltip title={<MetricTipByKey k="videoDiffs" />}>
            <QuestionCircleOutlined style={{ color: 'rgba(148,163,184,0.8)', fontSize: 12 }} />
          </Tooltip>
          {onExport && items.length > 0 ? (
            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={onExport}>
              CSV
            </Button>
          ) : null}
        </Space>
      }
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配到同标题视频" style={{ padding: 12 }} />
      ) : (
        <List<VideoDiff>
          size="small"
          dataSource={items}
          renderItem={(d) => {
            const pct = d.playsDiffPercent
            return (
              <List.Item>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                  <div style={{ color: 'rgba(148,163,184,0.85)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(d.prevPlays)} → {fmtNum(d.curPlays)}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                  {d.playsDiff >= 0 ? '+' : ''}
                  {fmtNum(d.playsDiff)}
                  {pct != null ? (
                    <div style={{ fontSize: 11, fontWeight: 400 }}>
                      {pct >= 0 ? '+' : ''}
                      {pct.toFixed(1)}%
                    </div>
                  ) : null}
                </div>
              </List.Item>
            )
          }}
        />
      )}
    </Card>
  )
}
