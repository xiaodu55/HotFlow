import { useMemo, useState } from 'react'
import { Card, Col, Empty, List, Row, Segmented, Select, Tag, Tooltip } from 'antd'
import type { AnalysisResult, SnapshotMeta, VideoDiff, VideoRecord } from '@shared/types'
import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts'
import { engagementRateOf } from '@shared/metrics'
import Chart from '../components/Chart'
import KpiCard from '../components/KpiCard'
import PageHeader from '../components/PageHeader'
import { fmtNum, fmtPct, fmtTime } from '../utils'

interface Props {
  analysis: AnalysisResult | null
  snapshots: SnapshotMeta[]
  compareId: string | undefined
  onCompareChange: (id: string | undefined) => void
}

/** 垂直渐变（柱/面积图用），from/to 为两位十六进制透明度 */
function vGradient(color: string, from: string, to: string): echarts.graphic.LinearGradient {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: color + from },
    { offset: 1, color: color + to }
  ])
}

function VideoList({ title, records, highlight }: { title: string; records: VideoRecord[]; highlight: string }) {
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

function DiffList({ title, items, up }: { title: string; items: VideoDiff[]; up: boolean }) {
  const color = up ? '#34d399' : '#f87171'
  return (
    <Card size="small" title={<span style={{ color }}>{title}</span>} styles={{ body: { paddingTop: 0 } }}>
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

export default function DashboardPage({ analysis, snapshots, compareId, onCompareChange }: Props) {
  const [rankDim, setRankDim] = useState<'plays' | 'engagement'>('plays')

  const compareOptions = useMemo(() => {
    if (!analysis) return []
    return snapshots
      .filter((s) => s.platform === analysis.snapshot.platform && s.id !== analysis.snapshot.id)
      .map((s) => ({ value: s.id, label: `${s.fileName}（${fmtTime(s.importedAt)} 导入）` }))
  }, [analysis, snapshots])

  if (!analysis) return null
  const { totals } = analysis
  const hasCompare = Boolean(analysis.compareSnapshot)

  const rankData =
    rankDim === 'plays'
      ? { top: analysis.topByPlays, bottom: analysis.bottomByPlays }
      : { top: analysis.topByEngagement, bottom: analysis.bottomByEngagement }

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
        itemStyle: { color: '#22d3ee' },
        lineStyle: { width: 2.5 },
        areaStyle: { color: vGradient('#22d3ee', '55', '05') }
      },
      {
        name: '互动率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: analysis.trend.map((b) => b.engagementRate),
        itemStyle: { color: '#e879f9' },
        lineStyle: { width: 2 }
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
        itemStyle: { borderRadius: [5, 5, 0, 0], color: vGradient('#22d3ee', 'aa', '22') },
        barMaxWidth: 26
      },
      {
        name: '互动率',
        type: 'line',
        yAxisIndex: 1,
        data: analysis.hourStats.map((h) => h.avgEngagementRate),
        itemStyle: { color: '#818cf8' },
        lineStyle: { width: 2 }
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
        itemStyle: { borderRadius: [5, 5, 0, 0], color: vGradient('#34d399', 'aa', '22') },
        barMaxWidth: 26
      },
      {
        name: '篇均播放',
        type: 'bar',
        yAxisIndex: 1,
        data: analysis.durationBuckets.map((d) => d.avgPlays),
        itemStyle: { borderRadius: [5, 5, 0, 0], color: vGradient('#818cf8', 'aa', '22') },
        barMaxWidth: 26
      }
    ]
  }

  const kpis = [
    { label: '视频总数', value: totals.videoCount, key: 'videoCount', fmt: fmtNum, suffix: '条' },
    { label: '总播放', value: totals.plays, key: 'plays', fmt: fmtNum, suffix: undefined },
    { label: '篇均播放', value: totals.avgPlays, key: 'avgPlays', fmt: fmtNum, suffix: undefined },
    { label: '互动率', value: totals.engagementRate, key: 'engagementRate', fmt: fmtPct, suffix: undefined, tooltip: '(赞+评+转+藏)/播放' },
    ...(totals.completionRate != null
      ? [{ label: '平均完播率', value: totals.completionRate, key: 'completionRate', fmt: fmtPct, suffix: undefined }]
      : []),
    ...(totals.followsGained != null
      ? [{ label: '涨粉', value: totals.followsGained, key: 'followsGained', fmt: fmtNum, suffix: undefined }]
      : []),
    { label: '总点赞', value: totals.likes, key: 'likes', fmt: fmtNum, suffix: undefined },
    { label: '总评论', value: totals.comments, key: 'comments', fmt: fmtNum, suffix: undefined },
    { label: '总分享', value: totals.shares, key: 'shares', fmt: fmtNum, suffix: undefined },
    { label: '总收藏', value: totals.collects, key: 'collects', fmt: fmtNum, suffix: undefined }
  ]

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader
        title="数据看板"
        description={`${analysis.snapshot.platformLabel} · ${analysis.snapshot.fileName} · ${analysis.snapshot.recordCount} 条视频`}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.9)' }}>对比期</span>
            <Select
              style={{ width: 300 }}
              value={compareId ?? ''}
              onChange={(v) => onCompareChange(v || undefined)}
              options={[{ value: '', label: '自动（同平台上一次导入）' }, ...compareOptions]}
              size="small"
            />
          </div>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <Col xs={12} sm={8} md={6} lg={4} xl={4} key={k.key}>
            <KpiCard
              label={k.label}
              value={k.value}
              format={k.fmt}
              suffix={k.suffix}
              tooltip={k.tooltip}
              delta={analysis.deltas?.[k.key]}
              glowIndex={i}
            />
          </Col>
        ))}
      </Row>

      {!hasCompare && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <span style={{ color: 'rgba(148,163,184,0.9)', fontSize: 12 }}>
            当前未选择对比期，环比数据不可用。可在页头「对比期」中选择任意一次历史导入进行对比。
          </span>
        </Card>
      )}

      {analysis.trend.length > 0 && (
        <Card
          size="small"
          title={
            <>
              发布趋势{' '}
              <Tag color="cyan" bordered={false}>
                {analysis.trendGranularity === 'day' ? '按日' : analysis.trendGranularity === 'week' ? '按周' : '按月'}
              </Tag>
            </>
          }
          style={{ marginBottom: 16 }}
        >
          <Chart option={trendOption} />
        </Card>
      )}

      <Row gutter={16}>
        {analysis.hourStats.length > 0 && (
          <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
            <Card size="small" title="发布时段 × 平均表现">
              <Chart option={hourOption} />
            </Card>
          </Col>
        )}
        {analysis.durationBuckets.length > 0 && (
          <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
            <Card size="small" title="视频时长 × 平均表现">
              <Chart option={durationOption} />
            </Card>
          </Col>
        )}
      </Row>

      {analysis.videoDiffs && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            <DiffList title="↑ 涨幅最大 Top 5" items={analysis.videoDiffs.up} up />
          </Col>
          <Col xs={24} md={12}>
            <DiffList title="↓ 跌幅最大 Top 5" items={analysis.videoDiffs.down} up={false} />
          </Col>
        </Row>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <Segmented
          value={rankDim}
          onChange={(v) => setRankDim(v as 'plays' | 'engagement')}
          options={[
            { value: 'plays', label: '按播放量' },
            { value: 'engagement', label: '按互动率' }
          ]}
        />
      </div>
      <Row gutter={16}>
        <Col xs={24} md={12} style={{ marginBottom: 16 }}>
          <VideoList
            title={rankDim === 'plays' ? '播放量 Top 5' : '互动率 Top 5'}
            records={rankData.top}
            highlight="#34d399"
          />
        </Col>
        <Col xs={24} md={12} style={{ marginBottom: 16 }}>
          <VideoList
            title={rankDim === 'plays' ? '播放量 Bottom 5' : '互动率 Bottom 5'}
            records={rankData.bottom}
            highlight="#f87171"
          />
        </Col>
      </Row>
    </div>
  )
}
