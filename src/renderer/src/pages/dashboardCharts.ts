/**
 * 看板图表配置构建：纯函数，只依赖 analysis。
 * 在 DashboardPage 中经 useMemo 缓存，避免任意 setState 触发全图重绘。
 */
import type { EChartsOption } from 'echarts'
import type { LinearGradientObject } from 'echarts/core'
import type { AnalysisResult } from '@shared/types'

/** 垂直渐变（柱/面积图用），from/to 为两位十六进制透明度。用 option 式渐变对象，避免依赖全量 echarts 包 */
function vGradient(color: string, from: string, to: string): LinearGradientObject {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: color + from },
      { offset: 1, color: color + to }
    ]
  }
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

export function buildTrendOption(analysis: AnalysisResult): EChartsOption {
  return {
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
}

export function buildHourOption(analysis: AnalysisResult): EChartsOption {
  return {
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
}

export function buildDurationOption(analysis: AnalysisResult): EChartsOption {
  return {
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
}

export function buildIncrementOption(analysis: AnalysisResult): EChartsOption {
  return {
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
}
