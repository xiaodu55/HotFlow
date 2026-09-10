import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Card, Col, Empty, List, Row, Segmented, Select, Space, Tag, Tooltip } from 'antd'
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import type { AnalysisResult, SnapshotMeta, StrategyReview, VideoDiff, VideoRecord } from '@shared/types'
import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts'
import { engagementRateOf } from '@shared/metrics'
import { METRIC_INFO } from '../metricsInfo'
import { MetricTipByKey } from '../components/MetricTip'
import Chart from '../components/Chart'
import KpiCard from '../components/KpiCard'
import PageHeader from '../components/PageHeader'
import { fmtNum, fmtPct, fmtTime, daysSince } from '../utils'

/** 卡片标题 + 口径说明图标 */
function MetricTitle({ tipKey, text }: { tipKey: keyof typeof METRIC_INFO; text: string }): ReactNode {
  return (
    <span>
      {text}{' '}
      <Tooltip title={<MetricTipByKey k={tipKey} />}>
        <QuestionCircleOutlined style={{ color: 'rgba(148,163,184,0.8)', fontSize: 12 }} />
      </Tooltip>
    </span>
  )
}

/** 复盘结论的粗略归类图标：命中关键词即标 ✓/✗，其余中性展示（完整文本始终可见） */
function reviewMark(line: string): ReactNode {
  if (/未见执行|未执行|未按|没有执行|无效|未见效/.test(line)) {
    return <CloseCircleOutlined style={{ color: '#f87171', marginRight: 6 }} />
  }
  if (/已验证|得到验证|有效|见效|成立/.test(line)) {
    return <CheckCircleOutlined style={{ color: '#34d399', marginRight: 6 }} />
  }
  return <InfoCircleOutlined style={{ color: 'rgba(148,163,184,0.8)', marginRight: 6 }} />
}

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

type NDatum = { value: number; n: number; itemStyle?: Record<string, unknown> }

/** 带样本数提示的 axis tooltip：标题附「n 条视频」，样本不足时特别标注 */
function tooltipWithSampleN(): EChartsOption['tooltip'] {
  return {
    trigger: 'axis',
    formatter: (params: unknown) => {
      const list = (Array.isArray(params) ? params : [params]) as Array<{
        name?: string
        marker?: string
        seriesName?: string
        value?: number
        data?: unknown
      }>
      const first = list[0]
      const raw = first?.data as { n?: number } | number | undefined
      const n = typeof raw === 'object' && raw != null ? raw.n : undefined
      const lines = list.map((p) => `${p.marker ?? ''}${p.seriesName ?? ''}: ${p.value ?? '—'}`)
      const head = `${first?.name ?? ''}${n != null ? `（${n} 条视频${n < 2 ? '，样本不足仅供参考' : ''}）` : ''}`
      return [head, ...lines].join('<br/>')
    }
  }
}

/** 低样本（n<2）柱子灰显，防止单条偶然爆款误导时段/时长策略 */
function barDatum(value: number | null, n: number, color: string, withGradient = true): NDatum {
  const base: NDatum = { value: value ?? 0, n }
  base.itemStyle =
    n < 2
      ? { color: 'rgba(148, 163, 184, 0.4)' }
      : withGradient
        ? { color: vGradient(color, 'aa', '22'), borderRadius: [4, 4, 0, 0] }
        : { color, borderRadius: [4, 4, 0, 0] }
  return base
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

function DiffList({
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

export default function DashboardPage({ analysis, snapshots, compareId, onCompareChange }: Props) {
  const [rankDim, setRankDim] = useState<'plays' | 'engagement'>('plays')
  const [guideVisible, setGuideVisible] = useState(() => localStorage.getItem('hotflow-guide-seen') !== '1')
  const [review, setReview] = useState<StrategyReview | null>(null)

  const snapshotId = analysis?.snapshot.id ?? null
  useEffect(() => {
    if (!snapshotId) {
      setReview(null)
      return
    }
    let alive = true
    window.api
      .getStrategyReview(snapshotId)
      .then((r) => {
        if (alive) setReview(r)
      })
      .catch(() => {
        // 复盘卡片加载失败不阻塞看板
      })
    return () => {
      alive = false
    }
  }, [snapshotId])

  const compareOptions = useMemo(() => {
    if (!analysis) return []
    return snapshots
      .filter(
        (s) =>
          s.platform === analysis.snapshot.platform &&
          (s.account ?? '') === (analysis.snapshot.account ?? '') &&
          s.id !== analysis.snapshot.id
      )
      .map((s) => ({ value: s.id, label: `${s.note || s.fileName}（${fmtTime(s.importedAt)}）` }))
  }, [analysis, snapshots])

  function exportDiffs(items: VideoDiff[], name: string) {
    const header = ['标题', '上期播放', '本期播放', '播放差值', '播放幅度(%)', '本期互动率(%)', '上期互动率(%)']
    const esc = (v: string | number | null): string => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(',')]
    for (const d of items) {
      lines.push(
        [esc(d.title), d.prevPlays, d.curPlays, d.playsDiff, d.playsDiffPercent ?? '', d.curEngagement, d.prevEngagement].join(',')
      )
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `HotFlow_涨跌榜_${name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!analysis) return null
  const { totals, increments } = analysis
  const hasCompare = Boolean(analysis.compareSnapshot)

  const rankData =
    rankDim === 'plays'
      ? { top: analysis.topByPlays, bottom: analysis.bottomByPlays }
      : { top: analysis.topByEngagement, bottom: analysis.bottomByEngagement }

  const trendOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['播放量', '互动率'] },
    grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: analysis.trend.map((b) => b.label), axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value' },
      { type: 'value', axisLabel: { formatter: '{value}%' } }
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
    tooltip: tooltipWithSampleN(),
    legend: { top: 0, data: ['篇均播放', '互动率'] },
    grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: analysis.hourStats.map((h) => h.label), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: [
      { type: 'value' },
      { type: 'value', axisLabel: { formatter: '{value}%' } }
    ],
    series: [
      {
        name: '篇均播放',
        type: 'bar',
        data: analysis.hourStats.map((h) => barDatum(h.avgPlays, h.videoCount, '#22d3ee')),
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
    tooltip: tooltipWithSampleN(),
    legend: { top: 0, data: ['平均完播率', '篇均播放'] },
    grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: analysis.durationBuckets.map((d) => d.label), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: [
      { type: 'value', axisLabel: { formatter: '{value}%' } },
      { type: 'value' }
    ],
    series: [
      {
        name: '平均完播率',
        type: 'bar',
        data: analysis.durationBuckets.map((d) => barDatum(d.avgCompletionRate, d.videoCount, '#34d399')),
        barMaxWidth: 26
      },
      {
        name: '篇均播放',
        type: 'bar',
        yAxisIndex: 1,
        data: analysis.durationBuckets.map((d) => barDatum(d.avgPlays, d.videoCount, '#a5b4fc')),
        barMaxWidth: 26
      }
    ]
  }

  const incrementOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['净增播放', '净增涨粉'] },
    grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: analysis.incrementTrend.map((p) => p.label), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: [
      { type: 'value' },
      { type: 'value' }
    ],
    series: [
      {
        name: '净增播放',
        type: 'bar',
        data: analysis.incrementTrend.map((p) => p.plays),
        itemStyle: { borderRadius: [5, 5, 0, 0], color: vGradient('#22d3ee', 'aa', '22') },
        barMaxWidth: 30
      },
      {
        name: '净增涨粉',
        type: 'line',
        yAxisIndex: 1,
        data: analysis.incrementTrend.map((p) => p.followsGained),
        itemStyle: { color: '#34d399' },
        lineStyle: { width: 2 }
      }
    ]
  }

  const kpis: Array<{ label: string; value: number; key: string; fmt: (n: number) => string; suffix?: string; tipKey: keyof typeof METRIC_INFO }> = [
    { label: '视频总数', value: totals.videoCount, key: 'videoCount', fmt: fmtNum, suffix: '条', tipKey: 'videoCount' },
    { label: '总播放', value: totals.plays, key: 'plays', fmt: fmtNum, tipKey: 'plays' },
    { label: '篇均播放', value: totals.avgPlays, key: 'avgPlays', fmt: fmtNum, tipKey: 'avgPlays' },
    { label: '中位数播放', value: totals.medianPlays, key: 'medianPlays', fmt: fmtNum, tipKey: 'medianPlays' },
    { label: '互动率', value: totals.engagementRate, key: 'engagementRate', fmt: fmtPct, tipKey: 'engagementRate' },
    ...(totals.completionRate != null
      ? [{ label: '平均完播率', value: totals.completionRate, key: 'completionRate', fmt: fmtPct, tipKey: 'completionRate' as const }]
      : []),
    ...(totals.followsGained != null
      ? [{ label: '涨粉', value: totals.followsGained, key: 'followsGained', fmt: fmtNum, tipKey: 'followsGained' as const }]
      : []),
    { label: '总点赞', value: totals.likes, key: 'likes', fmt: fmtNum, tipKey: 'likes' },
    { label: '总评论', value: totals.comments, key: 'comments', fmt: fmtNum, tipKey: 'comments' },
    { label: '总分享', value: totals.shares, key: 'shares', fmt: fmtNum, tipKey: 'shares' },
    { label: '总收藏', value: totals.collects, key: 'collects', fmt: fmtNum, tipKey: 'collects' }
  ]

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader
        title="数据看板"
        description={`${analysis.snapshot.platformLabel} · ${analysis.snapshot.account || '未命名账号'}${
          analysis.snapshot.note ? ` · ${analysis.snapshot.note}` : ''
        } · ${analysis.snapshot.fileName} · ${analysis.snapshot.recordCount} 条视频`}
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

      {guideVisible && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          closable
          afterClose={() => {
            localStorage.setItem('hotflow-guide-seen', '1')
            setGuideVisible(false)
          }}
          message="小贴士：看不懂的数字，鼠标放上去就有解释"
          description="指标卡和图表标题旁的 ? 图标，悬停即可查看计算公式与解读；页头「对比期」可以任选两次导入做对比；净增卡是最接近「本期真实表现」的口径。"
        />
      )}

      {(() => {
        const days = daysSince(analysis.snapshot.importedAt)
        return days != null && days >= 7 ? (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message={`距上次导入已 ${days} 天`}
            description="净增与涨跌榜依赖定期导入的快照对比，建议每周从创作者后台导出一次数据，保持分析连续性。"
          />
        ) : null
      })()}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {increments && (
          <>
            <Col xs={12} sm={8} md={6} lg={4} xl={4}>
              <KpiCard
                label="本期净增播放"
                value={increments.plays}
                format={(n) => (n >= 0 ? '' : '-') + fmtNum(Math.abs(n))}
                glowIndex={0}
                tipInfo={METRIC_INFO.incPlays}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4} xl={4}>
              <KpiCard label="本期净增点赞" value={increments.likes} format={fmtNum} glowIndex={1} tipInfo={METRIC_INFO.incLikes} />
            </Col>
            {increments.followsGained != null && (
              <Col xs={12} sm={8} md={6} lg={4} xl={4}>
                <KpiCard label="本期净增涨粉" value={increments.followsGained} format={fmtNum} glowIndex={3} tipInfo={METRIC_INFO.incFollows} />
              </Col>
            )}
          </>
        )}
        {kpis.map((k, i) => (
          <Col xs={12} sm={8} md={6} lg={4} xl={4} key={k.key}>
            <KpiCard
              label={k.label}
              value={k.value}
              format={k.fmt}
              suffix={k.suffix}
              tipInfo={METRIC_INFO[k.tipKey]}
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

      {review?.previous && (
        <Card
          size="small"
          title={
            <Space>
              <AuditOutlined style={{ color: '#a78bfa' }} />
              策略复盘
              {review.retrospective.length > 0 ? <Tag color="success">已复盘</Tag> : <Tag color="warning">待验证</Tag>}
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.9)', marginBottom: 4 }}>
            上期建议（{fmtTime(review.previous.generatedAt)} 诊断）：
          </div>
          <List
            size="small"
            dataSource={[...review.previous.advicePublishTime, ...review.previous.adviceActions]}
            locale={{ emptyText: '上期诊断未给出结构化建议' }}
            renderItem={(item) => (
              <List.Item style={{ padding: '4px 0' }}>
                <span style={{ fontSize: 13, lineHeight: 1.7 }}>{item}</span>
              </List.Item>
            )}
          />
          {review.retrospective.length > 0 ? (
            <>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.9)', margin: '10px 0 4px' }}>本期复盘结论：</div>
              <List
                size="small"
                dataSource={review.retrospective}
                renderItem={(line) => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <span style={{ fontSize: 13, lineHeight: 1.7 }}>
                      {reviewMark(line)}
                      {line}
                    </span>
                  </List.Item>
                )}
              />
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              message="上期建议待验证：为本期数据重新生成 AI 诊断，即可自动对照复盘执行情况。"
              style={{ marginTop: 8 }}
            />
          )}
        </Card>
      )}

      {analysis.trend.length > 0 && (
        <Card
          size="small"
          title={
            <MetricTitle
              tipKey="trendChart"
              text={`发布趋势 ${analysis.trendGranularity === 'day' ? '（按日）' : analysis.trendGranularity === 'week' ? '（按周）' : '（按月）'}`}
            />
          }
          style={{ marginBottom: 16 }}
        >
          <Chart option={trendOption} />
        </Card>
      )}

      {analysis.incrementTrend.length > 0 && (
        <Card size="small" title={<MetricTitle tipKey="incrementTrend" text="净增趋势" />}>
          <Chart option={incrementOption} />
        </Card>
      )}

      <Row gutter={16}>
        {analysis.hourStats.length > 0 && (
          <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
            <Card size="small" title={<MetricTitle tipKey="hourChart" text="发布时段 × 平均表现" />}>
              <Chart option={hourOption} />
            </Card>
          </Col>
        )}
        {analysis.durationBuckets.length > 0 && (
          <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
            <Card size="small" title={<MetricTitle tipKey="durationChart" text="视频时长 × 平均表现" />}>
              <Chart option={durationOption} />
            </Card>
          </Col>
        )}
      </Row>

      {analysis.videoDiffs && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            <DiffList
              title="↑ 涨幅最大 Top 5"
              items={analysis.videoDiffs.up}
              up
              onExport={() => exportDiffs(analysis.videoDiffs?.up ?? [], '涨幅')}
            />
          </Col>
          <Col xs={24} md={12}>
            <DiffList
              title="↓ 跌幅最大 Top 5"
              items={analysis.videoDiffs.down}
              up={false}
              onExport={() => exportDiffs(analysis.videoDiffs?.down ?? [], '跌幅')}
            />
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
