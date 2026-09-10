/**
 * 周报素材构建：纯函数，不依赖 electron、可单测。
 * renderWeeklyTemplate 是无大模型时的兜底周报（纯数据模板）；
 * buildWeeklyDataDigest 产出喂给 LLM 的紧凑摘要（llm.ts 使用）。
 */
import type { AnalysisResult, DiagnosisResult } from './types'

export function formatWeeklyDelta(percent: number | null | undefined): string {
  if (percent == null) return '—'
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
}

const fmtNum = (n: number | null | undefined): string => (n == null ? '—' : Math.round(n).toLocaleString('zh-CN'))
const fmtPct = (n: number | null | undefined): string => (n == null ? '—' : `${n.toFixed(1)}%`)

/** 环比后缀：无对比期时为空串 */
function ring(percent: number | null | undefined): string {
  return percent == null ? '' : `（环比 ${formatWeeklyDelta(percent)}）`
}

export interface WeeklyDigest {
  account: string
  fileName: string
  period: { from: string | null; to: string | null }
  totals: AnalysisResult['totals']
  deltas: AnalysisResult['deltas']
  increments: AnalysisResult['increments']
  gradeCounts: Record<string, number>
  top: Array<{ title: string; plays: number }>
  bottom: Array<{ title: string; plays: number }>
  bestHour: { label: string; avgPlays: number } | null
  retrospective: string[]
}

export function buildWeeklyDataDigest(
  analysis: AnalysisResult,
  diagnosis: DiagnosisResult | null = null
): WeeklyDigest {
  const bestHour = [...analysis.hourStats].sort((a, b) => b.avgPlays - a.avgPlays)[0] ?? null
  return {
    account: analysis.snapshot.account || '未命名账号',
    fileName: analysis.snapshot.fileName,
    period: analysis.periodRange,
    totals: analysis.totals,
    deltas: analysis.deltas,
    increments: analysis.increments,
    gradeCounts: analysis.gradeCounts,
    top: analysis.topByPlays.slice(0, 5).map((r) => ({ title: r.title, plays: r.plays })),
    bottom: analysis.bottomByPlays.slice(0, 5).map((r) => ({ title: r.title, plays: r.plays })),
    bestHour: bestHour ? { label: bestHour.label, avgPlays: bestHour.avgPlays } : null,
    retrospective: diagnosis?.retrospective ?? []
  }
}

export function renderWeeklyTemplate(analysis: AnalysisResult, diagnosis: DiagnosisResult | null = null): string {
  const d = buildWeeklyDataDigest(analysis, diagnosis)
  const { totals } = d
  const lines: string[] = []

  lines.push(`## 运营周报 · ${d.account}`)
  const period = d.period.from && d.period.to ? `${d.period.from} ~ ${d.period.to}` : d.fileName
  lines.push(`统计周期：${period}（${totals.videoCount} 条视频）`)
  lines.push('')
  lines.push('### 核心数据')
  lines.push(
    `- 总播放 ${fmtNum(totals.plays)}${ring(d.deltas?.plays?.percent)}，篇均播放 ${fmtNum(totals.avgPlays)}${ring(
      d.deltas?.avgPlays?.percent
    )}`
  )
  lines.push(
    `- 互动率 ${fmtPct(totals.engagementRate)}${ring(d.deltas?.engagementRate?.percent)}，平均完播率 ${fmtPct(
      totals.completionRate
    )}`
  )
  if (totals.followsGained != null) {
    lines.push(`- 涨粉 ${fmtNum(totals.followsGained)}${ring(d.deltas?.followsGained?.percent)}`)
  }
  if (d.increments) {
    lines.push(
      `- 净增口径：播放 +${fmtNum(d.increments.plays)}、点赞 +${fmtNum(d.increments.likes)}${
        d.increments.followsGained != null ? `、涨粉 +${fmtNum(d.increments.followsGained)}` : ''
      }（匹配 ${d.increments.matched} 条同名视频）`
    )
  }
  lines.push(
    `- 内容分布：爆款 ${d.gradeCounts['爆款'] ?? 0} · 优质 ${d.gradeCounts['优质'] ?? 0} · 正常 ${
      d.gradeCounts['正常'] ?? 0
    } · 低效 ${d.gradeCounts['低效'] ?? 0}`
  )
  lines.push('')

  if (d.top.length) {
    lines.push('### 表现最好')
    d.top.slice(0, 3).forEach((v, i) => lines.push(`${i + 1}. ${v.title}（${fmtNum(v.plays)} 播放）`))
    lines.push('')
  }
  if (d.bestHour) {
    lines.push(`**最佳发布时段**：${d.bestHour.label}（篇均播放 ${fmtNum(d.bestHour.avgPlays)}）`)
  }
  if (d.retrospective.length) {
    lines.push('')
    lines.push('### 上期建议执行情况')
    d.retrospective.forEach((line) => lines.push(`- ${line}`))
  }
  lines.push('')
  lines.push('—— 由 HotFlow 自动生成')
  return lines.join('\n')
}
