import { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Col, Row, Segmented, Select } from 'antd'
import type { AnalysisResult, SnapshotMeta, StrategyReview, VideoDiff } from '@shared/types'
import { METRIC_INFO } from '../metricsInfo'
import Chart from '../components/Chart'
import KpiCard from '../components/KpiCard'
import PageHeader from '../components/PageHeader'
import { fmtNum, fmtPct, fmtTime, daysSince } from '../utils'
import { buildDurationOption, buildHourOption, buildIncrementOption, buildTrendOption } from './dashboardCharts'
import { DiffList, MetricTitle, VideoList } from './DashboardCards'
import StrategyReviewCard from './StrategyReviewCard'

interface Props {
  analysis: AnalysisResult | null
  snapshots: SnapshotMeta[]
  compareId: string | undefined
  onCompareChange: (id: string | undefined) => void
}

type KpiItem = {
  label: string
  value: number
  key: string
  fmt: (n: number) => string
  suffix?: string
  tipKey: keyof typeof METRIC_INFO
}

function buildKpis(analysis: AnalysisResult): KpiItem[] {
  const { totals } = analysis
  return [
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

  // 图表配置与 KPI 只随 analysis 变化；否则任意 setState（切排名、关提示）都会让全部图表 notMerge 重绘
  const charts = useMemo(
    () =>
      analysis
        ? {
            trendOption: buildTrendOption(analysis),
            hourOption: buildHourOption(analysis),
            durationOption: buildDurationOption(analysis),
            incrementOption: buildIncrementOption(analysis),
            kpis: buildKpis(analysis)
          }
        : null,
    [analysis]
  )

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

  if (!analysis || !charts) return null
  const { totals, increments } = analysis
  const { trendOption, hourOption, durationOption, incrementOption, kpis } = charts
  const hasCompare = Boolean(analysis.compareSnapshot)

  const rankData =
    rankDim === 'plays'
      ? { top: analysis.topByPlays, bottom: analysis.bottomByPlays }
      : { top: analysis.topByEngagement, bottom: analysis.bottomByEngagement }

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

      <StrategyReviewCard review={review} />

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
