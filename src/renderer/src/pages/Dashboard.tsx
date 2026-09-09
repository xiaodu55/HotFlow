import type { ReactNode } from 'react'
import { Card, Col, List, Row, Statistic, Tag, Tooltip } from 'antd'
import type { AnalysisResult, VideoRecord } from '@shared/types'
import type { EChartsOption } from 'echarts'
import { engagementRateOf } from '@shared/metrics'
import Chart from '../components/Chart'
import { DeltaTag, fmtNum, fmtPct, fmtTime } from '../utils'

interface Props {
  analysis: AnalysisResult | null
}

function VideoList({
  title,
  records,
  highlight
}: {
  title: string
  records: VideoRecord[]
  highlight: string
}) {
  return (
    <Card size="small" title={title} styles={{ body: { paddingTop: 0 } }}>
      <List<VideoRecord>
        size="small"
        dataSource={records}
        renderItem={(r) => (
          <List.Item>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
              <div style={{ color: '#999', fontSize: 12 }}>{fmtTime(r.publishTime)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, color: highlight }}>{fmtNum(r.plays)}</div>
              <div style={{ color: '#999', fontSize: 12 }}>互动率 {fmtPct(engagementRateOf(r))}</div>
            </div>
          </List.Item>
        )}
      />
    </Card>
  )
}

export default function DashboardPage({ analysis: analysisProp }: Props) {
  if (!analysisProp) return null
  const analysis = analysisProp
  const { totals } = analysis
  const hasCompare = Boolean(analysis.compareSnapshot)

  function kpiCard(
    title: string,
    value: string,
    deltaKey?: string,
    suffix?: string,
    tooltip?: string
  ): ReactNode {
    const delta = deltaKey ? analysis.deltas?.[deltaKey] : undefined
    return (
      <Col xs={12} sm={8} md={6} lg={4} key={title}>
        <Card size="small">
          <Statistic
            title={
              tooltip ? (
                <Tooltip title={tooltip}>
                  <span>{title}</span>
                </Tooltip>
              ) : (
                title
              )
            }
            value={value}
            suffix={suffix}
          />
          <div style={{ marginTop: 6, minHeight: 22 }}>
            {hasCompare && delta ? (
              <>
                <DeltaTag delta={delta} unit={suffix} />
                <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>对比上期</span>
              </>
            ) : null}
          </div>
        </Card>
      </Col>
    )
  }

  const trendOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['播放量', '互动率'] },
    grid: { left: 70, right: 60, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: analysis.trend.map((b) => b.label) },
    yAxis: [
      { type: 'value', name: '播放量' },
      { type: 'value', name: '互动率', axisLabel: { formatter: '{value}%' } }
    ],
    series: [
      {
        name: '播放量',
        type: 'line',
        smooth: true,
        data: analysis.trend.map((b) => b.plays),
        itemStyle: { color: '#4f6ef7' },
        areaStyle: { opacity: 0.08 }
      },
      {
        name: '互动率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: analysis.trend.map((b) => b.engagementRate),
        itemStyle: { color: '#f59e0b' }
      }
    ]
  }

  const hourOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['篇均播放', '互动率'] },
    grid: { left: 70, right: 60, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: analysis.hourStats.map((h) => h.label) },
    yAxis: [
      { type: 'value', name: '篇均播放' },
      { type: 'value', name: '互动率', axisLabel: { formatter: '{value}%' } }
    ],
    series: [
      {
        name: '篇均播放',
        type: 'bar',
        data: analysis.hourStats.map((h) => h.avgPlays),
        itemStyle: { color: '#4f6ef7', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '互动率',
        type: 'line',
        yAxisIndex: 1,
        data: analysis.hourStats.map((h) => h.avgEngagementRate),
        itemStyle: { color: '#f59e0b' }
      }
    ]
  }

  const durationOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['平均完播率', '篇均播放'] },
    grid: { left: 70, right: 60, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: analysis.durationBuckets.map((d) => d.label) },
    yAxis: [
      { type: 'value', name: '完播率', axisLabel: { formatter: '{value}%' } },
      { type: 'value', name: '篇均播放' }
    ],
    series: [
      {
        name: '平均完播率',
        type: 'bar',
        data: analysis.durationBuckets.map((d) => d.avgCompletionRate),
        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '篇均播放',
        type: 'bar',
        yAxisIndex: 1,
        data: analysis.durationBuckets.map((d) => d.avgPlays),
        itemStyle: { color: '#a5b4fc', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          {kpiCard('视频总数', fmtNum(totals.videoCount), 'videoCount', '条')}
          {kpiCard('总播放', fmtNum(totals.plays), 'plays')}
          {kpiCard('篇均播放', fmtNum(totals.avgPlays), 'avgPlays')}
          {kpiCard('互动率', fmtPct(totals.engagementRate), 'engagementRate', undefined, '(赞+评+转+藏)/播放')}
          {totals.completionRate != null
            ? kpiCard('平均完播率', fmtPct(totals.completionRate), 'completionRate')
            : null}
          {totals.followsGained != null ? kpiCard('涨粉', fmtNum(totals.followsGained), 'followsGained') : null}
          {kpiCard('总点赞', fmtNum(totals.likes), 'likes')}
          {kpiCard('总评论', fmtNum(totals.comments), 'comments')}
          {kpiCard('总分享', fmtNum(totals.shares), 'shares')}
          {kpiCard('总收藏', fmtNum(totals.collects), 'collects')}
        </Row>
        {!hasCompare && (
          <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
            导入第二份数据后，会自动和上一次导入做环比对比。
          </div>
        )}
      </Card>

      {analysis.trend.length > 0 && (
        <Card
          size="small"
          title={
            <>
              发布趋势{' '}
              <Tag color="blue">
                {analysis.trendGranularity === 'day' ? '按日' : analysis.trendGranularity === 'week' ? '按周' : '按月'}
              </Tag>
            </>
          }
          style={{ marginBottom: 16 }}
        >
          <Chart option={trendOption} />
        </Card>
      )}

      {analysis.hourStats.length > 0 && (
        <Card size="small" title="发布时段 × 平均表现" style={{ marginBottom: 16 }}>
          <Chart option={hourOption} />
        </Card>
      )}

      {analysis.durationBuckets.length > 0 && (
        <Card size="small" title="视频时长 × 平均表现" style={{ marginBottom: 16 }}>
          <Chart option={durationOption} />
        </Card>
      )}

      <Row gutter={16}>
        <Col xs={24} md={12} style={{ marginBottom: 16 }}>
          <VideoList title="播放量 Top 5" records={analysis.topByPlays} highlight="#16a34a" />
        </Col>
        <Col xs={24} md={12} style={{ marginBottom: 16 }}>
          <VideoList title="播放量 Bottom 5" records={analysis.bottomByPlays} highlight="#dc2626" />
        </Col>
      </Row>
    </div>
  )
}
