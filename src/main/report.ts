import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { engagementRateOf } from '@shared/metrics'
import type { AnalysisResult, DiagnosisResult, VideoDiff, VideoRecord } from '@shared/types'

/** 优先内联本地 echarts.min.js，打包后也能离线打开；失败时退回 CDN */
function loadEchartsJs(): string {
  try {
    const pkgPath = require.resolve('echarts/package.json')
    return readFileSync(join(dirname(pkgPath), 'dist', 'echarts.min.js'), 'utf-8')
  } catch {
    return ''
  }
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('zh-CN')
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toFixed(1)}%`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}

function deltaHtml(d: { value: number; percent: number | null; direction: string } | undefined): string {
  if (!d || d.direction === 'flat') return '<span class="delta flat">—</span>'
  const arrow = d.direction === 'up' ? '↑' : '↓'
  const cls = d.direction === 'up' ? 'up' : 'down'
  const pctText = d.percent == null ? '' : ` ${Math.abs(d.percent).toFixed(1)}%`
  return `<span class="delta ${cls}">${arrow}${pctText}</span>`
}

function kpiCard(label: string, value: string, delta?: { value: number; percent: number | null; direction: string }): string {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-delta">${
    delta ? `${deltaHtml(delta)}<span class="kpi-vs">对比上期</span>` : ''
  }</div></div>`
}

function recordTable(records: VideoRecord[], highlight: 'good' | 'bad'): string {
  const rows = records
    .map(
      (r, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td class="title-cell">${esc(r.title)}</td>
      <td>${fmtTime(r.publishTime)}</td>
      <td class="num">${fmtNum(r.plays)}</td>
      <td class="num">${fmtPct(engagementRateOf(r))}</td>
      <td class="num">${fmtPct(r.completionRate)}</td>
      <td class="num">${fmtNum(r.likes)}</td>
      <td class="num">${fmtNum(r.comments)}</td>
    </tr>`
    )
    .join('')
  return `<table>
    <thead><tr><th>#</th><th>标题</th><th>发布时间</th><th>播放量</th><th>互动率</th><th>完播率</th><th>点赞</th><th>评论</th></tr></thead>
    <tbody class="${highlight === 'good' ? 'tbody-good' : 'tbody-bad'}">${rows}</tbody>
  </table>`
}

function listSection(title: string, items: string[], cls: string): string {
  return `<div class="diag-block ${cls}">
    <h4>${esc(title)}</h4>
    <ul>${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </div>`
}

/** 两期整体指标对比表（环比明细） */
/** 内容等级分布说明（爆款/优质/正常/低效条数与水位标准） */
function gradeDistributionHtml(analysis: AnalysisResult): string {
  const levels = analysis.levels
  if (!levels) return ''
  const c = analysis.gradeCounts
  return `<p class="insight" style="margin-bottom:14px">📌 内容分级（水位：播放中位数 <b>${fmtNum(levels.medianPlays)}</b>、平均互动率 <b>${levels.avgEngagementRate.toFixed(1)}%</b>）：
  爆款 <b>${c['爆款'] ?? 0}</b> 条 · 优质 <b>${c['优质'] ?? 0}</b> 条 · 正常 <b>${c['正常'] ?? 0}</b> 条 · 低效 <b>${c['低效'] ?? 0}</b> 条。
  分级规则：爆款=播放≥中位数×2 且互动率高于平均；低效=播放<中位数÷2。</p>`
}

function deltaTableHtml(analysis: AnalysisResult): string {
  const { totals, prevTotals, deltas } = analysis
  if (!prevTotals || !deltas) return ''
  const rows: Array<[string, number | null, number | null, (n: number | null) => string]> = [
    ['视频总数', totals.videoCount, prevTotals.videoCount, fmtNum],
    ['总播放', totals.plays, prevTotals.plays, fmtNum],
    ['篇均播放', totals.avgPlays, prevTotals.avgPlays, fmtNum],
    ['互动率', totals.engagementRate, prevTotals.engagementRate, fmtPct],
    ['总点赞', totals.likes, prevTotals.likes, fmtNum],
    ['总评论', totals.comments, prevTotals.comments, fmtNum],
    ['总分享', totals.shares, prevTotals.shares, fmtNum],
    ['总收藏', totals.collects, prevTotals.collects, fmtNum],
    ['涨粉', totals.followsGained, prevTotals.followsGained, fmtNum],
    ['平均完播率', totals.completionRate, prevTotals.completionRate, fmtPct]
  ]
  const body = rows
    .filter(([, cur, prev]) => cur != null || prev != null)
    .map(([label, cur, prev, fmt]) => {
      const d = deltas[label] ?? null
      const arrow =
        d?.direction === 'up' ? '<span class="delta up">↑</span>' : d?.direction === 'down' ? '<span class="delta down">↓</span>' : '<span class="delta flat">→</span>'
      const pct = d?.percent != null ? `${Math.abs(d.percent).toFixed(1)}%` : '—'
      return `<tr><td>${esc(label)}</td><td class="num">${fmt(prev)}</td><td class="num">${fmt(cur)}</td><td class="num">${arrow}</td><td class="num">${pct}</td></tr>`
    })
    .join('')
  return `<tr><th>指标</th><th>上期</th><th>本期</th><th>方向</th><th>幅度</th></tr><tbody>${body}</tbody>`
}

/** 从分时段数据提炼一句话结论 */
function hourInsightHtml(analysis: AnalysisResult): string {
  if (analysis.hourStats.length < 2) return ''
  const best = [...analysis.hourStats].sort((a, b) => b.avgPlays - a.avgPlays)[0]
  const worst = [...analysis.hourStats].sort((a, b) => a.avgPlays - b.avgPlays)[0]
  if (best.avgPlays <= 0) return ''
  const ratio = worst.avgPlays > 0 ? (best.avgPlays / worst.avgPlays).toFixed(1) : null
  return `<p class="insight">📌 时段结论：<b>${esc(best.label)}</b> 发布的视频篇均播放最高（${fmtNum(best.avgPlays)}）${
    ratio ? `，约为 <b>${esc(worst.label)}</b>（${fmtNum(worst.avgPlays)}）的 ${ratio} 倍` : ''
  }；互动率最高的是 <b>${esc([...analysis.hourStats].sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)[0].label)}</b>。</p>`
}

function diagnosisHtml(diagnosis: DiagnosisResult | null): string {  if (!diagnosis) {
    return `<div class="diag-empty">尚未生成 AI 诊断。在应用的「AI 诊断」页配置大模型并生成后，导出的报告会自动包含诊断结论。</div>`
  }
  const parts: string[] = []
  parts.push(`<p class="diag-summary">${esc(diagnosis.summary)}</p>`)
  if (diagnosis.rawText) {
    return parts.join('') + `<pre class="diag-raw">${esc(diagnosis.rawText)}</pre>`
  }
  if (diagnosis.hotPatterns.length) parts.push(listSection('爆款共性', diagnosis.hotPatterns, 'hot'))
  if (diagnosis.weakPatterns.length) parts.push(listSection('低效归因', diagnosis.weakPatterns, 'weak'))
  if (diagnosis.titleNotes) parts.push(`<div class="diag-block"><h4>标题/封面诊断</h4><p>${esc(diagnosis.titleNotes)}</p></div>`)
  if (diagnosis.advicePublishTime.length) parts.push(listSection('发布时间建议', diagnosis.advicePublishTime, 'advice'))
  if (diagnosis.adviceTopics.length) parts.push(listSection('选题方向建议', diagnosis.adviceTopics, 'advice'))
  if (diagnosis.adviceActions.length) parts.push(listSection('行动清单', diagnosis.adviceActions, 'action'))
  if (diagnosis.conversation && diagnosis.conversation.length > 0) {
    const qa = diagnosis.conversation
      .map(
        (turn) => `<div style="margin-bottom: 14px;">
        <p style="font-weight: 700; color: #4f6ef7; margin: 0 0 4px;">Q：${esc(turn.question)}</p>
        <p style="white-space: pre-wrap; line-height: 1.8; margin: 0;">${esc(turn.answer)}</p>
      </div>`
      )
      .join('')
    parts.push(
      `<div class="diag-block" style="margin-top: 16px;"><h4 style="color: #4f6ef7;">追问与深挖（AI 诊断后的针对性分析）</h4>${qa}</div>`
    )
  }
  if (diagnosis.model) {
    parts.push(`<p class="diag-meta">由 ${esc(diagnosis.model)} 于 ${esc(fmtTime(diagnosis.generatedAt))} 生成</p>`)
  }
  return parts.join('')
}

/** 涨跌榜表格（涨/跌各一张） */
function diffTableHtml(items: VideoDiff[], dir: 'up' | 'down'): string {
  const rows = items
    .map(
      (d) => `<tr>
      <td class="title-cell">${esc(d.title)}</td>
      <td class="num">${fmtNum(d.prevPlays)}</td>
      <td class="num">${fmtNum(d.curPlays)}</td>
      <td class="num ${dir}">${dir === 'up' ? '+' : ''}${fmtNum(d.playsDiff)}</td>
      <td class="num ${dir}">${d.playsDiffPercent == null ? '—' : `${dir === 'up' ? '+' : ''}${d.playsDiffPercent.toFixed(1)}%`}</td>
    </tr>`
    )
    .join('')
  return `<table>
    <thead><tr><th>标题</th><th>上期播放</th><th>本期播放</th><th>差值</th><th>幅度</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

export function buildReportHtml(analysis: AnalysisResult, diagnosis: DiagnosisResult | null): string {
  const { totals, deltas, increments } = analysis
  const accountLabel = analysis.snapshot.account || '未命名账号'
  const noteLabel = analysis.snapshot.note ? `（${esc(analysis.snapshot.note)}）` : ''
  const compareNote = analysis.compareSnapshot
    ? `环比对象：${esc(analysis.compareSnapshot.note || analysis.compareSnapshot.fileName)}（${esc(fmtTime(analysis.compareSnapshot.importedAt))} 导入）`
    : '暂无上期数据可比'

  const trendLabels = analysis.trend.map((b) => b.label)
  const trendPlays = analysis.trend.map((b) => b.plays)
  const trendEng = analysis.trend.map((b) => b.engagementRate)
  const hourLabels = analysis.hourStats.map((h) => h.label)
  const hourPlays = analysis.hourStats.map((h) => h.avgPlays)
  const hourEng = analysis.hourStats.map((h) => h.avgEngagementRate)
  const durLabels = analysis.durationBuckets.map((d) => d.label)
  const durCompletion = analysis.durationBuckets.map((d) => d.avgCompletionRate)
  const durPlays = analysis.durationBuckets.map((d) => d.avgPlays)
  const incLabels = analysis.incrementTrend.map((p) => p.label)
  const incPlays = analysis.incrementTrend.map((p) => p.plays)
  const incFollows = analysis.incrementTrend.map((p) => p.followsGained)

  const granularityNote =
    analysis.trendGranularity === 'day' ? '按日' : analysis.trendGranularity === 'week' ? '按周' : '按月'

  const lib = loadEchartsJs()
  const echartsTag = lib
    ? `<script>${lib}</script>`
    : `<script src="https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js"></script>`

  const payload = JSON.stringify({
    trendLabels, trendPlays, trendEng,
    hourLabels, hourPlays, hourEng,
    durLabels, durCompletion, durPlays,
    incLabels, incPlays, incFollows
  }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HotFlow 视频运营分析报告</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #f4f6f9; color: #1f2329; padding: 32px 16px; }
  .wrap { max-width: 1080px; margin: 0 auto; }
  .card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size: 24px; margin-bottom: 6px; }
  .meta { color: #6b7280; font-size: 13px; line-height: 1.8; }
  h3 { font-size: 17px; margin-bottom: 14px; padding-left: 10px; border-left: 4px solid #4f6ef7; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .kpi { background: #f8f9fc; border-radius: 10px; padding: 14px 16px; }
  .kpi-label { font-size: 12px; color: #6b7280; }
  .kpi-value { font-size: 24px; font-weight: 700; margin: 4px 0 2px; }
  .delta.up { color: #16a34a; } .delta.down { color: #dc2626; } .delta.flat { color: #9ca3af; }
  .kpi-vs { color: #9ca3af; font-size: 11px; margin-left: 6px; }
  .chart { width: 100%; height: 340px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eef0f4; }
  th { color: #6b7280; font-weight: 500; background: #f8f9fc; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .rank { color: #9ca3af; width: 28px; }
  .title-cell { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tbody-good .rank { color: #16a34a; font-weight: 700; }
  .tbody-bad .rank { color: #dc2626; font-weight: 700; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }
  .diag-summary { font-size: 15px; line-height: 1.8; background: #f5f7ff; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; }
  .diag-block { margin-bottom: 14px; }
  .diag-block h4 { font-size: 14px; margin-bottom: 6px; }
  .diag-block.hot h4 { color: #16a34a; } .diag-block.weak h4 { color: #dc2626; }
  .diag-block.action h4 { color: #d97706; }
  .diag-block ul { padding-left: 20px; }
  .diag-block li { line-height: 1.9; font-size: 14px; }
  .diag-block.advice h4 { color: #4f6ef7; }
  .diag-empty { color: #9ca3af; font-size: 14px; line-height: 1.8; }
  .diag-raw { white-space: pre-wrap; background: #f8f9fc; padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.7; }
  .diag-meta { color: #9ca3af; font-size: 12px; margin-top: 10px; }
  .footer { color: #9ca3af; font-size: 12px; text-align: center; padding: 8px 0 24px; }
  .num.up { color: #16a34a; font-weight: 600; }
  .num.down { color: #dc2626; font-weight: 600; }
  .diff-h { font-size: 14px; margin: 0 0 8px 2px; }
  .diff-h.up { color: #16a34a; } .diff-h.down { color: #dc2626; }
  .insight { font-size: 13.5px; line-height: 1.8; color: #374151; background: #f0fdfa; border-left: 3px solid #10b981; border-radius: 0 8px 8px 0; padding: 10px 14px; margin-top: 4px; }
  @media print {
    body { background: #fff; padding: 0; }
    .card { box-shadow: none; border: 1px solid #e5e7eb; break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>HotFlow 视频运营分析报告</h1>
    <div class="meta">
      数据来源：${esc(analysis.snapshot.platformLabel)} · <b>${accountLabel}</b>${noteLabel} · ${esc(analysis.snapshot.fileName)}（${analysis.snapshot.recordCount} 条视频）<br>
      统计周期：${analysis.periodRange.from && analysis.periodRange.to ? `${esc(analysis.periodRange.from)} ~ ${esc(analysis.periodRange.to)}（按发布时间）` : '—'}<br>
      导入时间：${esc(fmtTime(analysis.snapshot.importedAt))} · 报告生成：${esc(fmtTime(analysis.generatedAt))}<br>
      ${compareNote}
    </div>
  </div>

  <div class="card">
    <h3>核心指标${deltas ? '' : '（暂无上期环比）'}</h3>
    ${increments
      ? `<p class="insight" style="margin-bottom:14px">📌 净增口径（同名视频累计差求和）：本期净增播放 <b>${fmtNum(increments.plays)}</b>、净增点赞 <b>${fmtNum(increments.likes)}</b>${
          increments.followsGained != null ? `、净增涨粉 <b>${fmtNum(increments.followsGained)}</b>` : ''
        }（匹配 ${increments.matched} 条视频）。下方总量含历史存量，环比箭头反映累计口径。</p>`
      : ''
    }
    ${gradeDistributionHtml(analysis)}
    <div class="kpi-grid">
      ${kpiCard('总播放', fmtNum(totals.plays), deltas?.plays)}
      ${kpiCard('篇均播放', fmtNum(totals.avgPlays), deltas?.avgPlays)}
      ${kpiCard('互动率', fmtPct(totals.engagementRate), deltas?.engagementRate)}
      ${kpiCard('总点赞', fmtNum(totals.likes), deltas?.likes)}
      ${kpiCard('总评论', fmtNum(totals.comments), deltas?.comments)}
      ${kpiCard('总分享', fmtNum(totals.shares), deltas?.shares)}
      ${kpiCard('总收藏', fmtNum(totals.collects), deltas?.collects)}
      ${totals.followsGained != null ? kpiCard('涨粉', fmtNum(totals.followsGained), deltas?.followsGained) : ''}
      ${totals.completionRate != null ? kpiCard('平均完播率', fmtPct(totals.completionRate), deltas?.completionRate) : ''}
    </div>
  </div>

  ${
    analysis.compareSnapshot && analysis.prevTotals
      ? `<div class="card"><h3>两期对比明细</h3><table>${deltaTableHtml(analysis)}</table></div>`
      : ''
  }

  ${
    analysis.trend.length
      ? `<div class="card"><h3>发布趋势（${granularityNote}）</h3><div id="trend" class="chart"></div></div>`
      : ''
  }
  ${incLabels.length ? `<div class="card"><h3>净增趋势（相邻两次导入之间）</h3><div id="inc" class="chart"></div></div>` : ''}
  ${analysis.hourStats.length ? `<div class="card"><h3>发布时段 × 平均表现</h3><div id="hour" class="chart"></div>${hourInsightHtml(analysis)}</div>` : ''}
  ${analysis.durationBuckets.length ? `<div class="card"><h3>视频时长 × 平均表现</h3><div id="duration" class="chart"></div></div>` : ''}

  <div class="card">
    <h3>表现最好 Top 5（按播放量）</h3>
    ${recordTable(analysis.topByPlays, 'good')}
  </div>
  <div class="card">
    <h3>表现最差 Bottom 5（按播放量）</h3>
    ${recordTable(analysis.bottomByPlays, 'bad')}
  </div>

  ${
    analysis.videoDiffs && (analysis.videoDiffs.up.length > 0 || analysis.videoDiffs.down.length > 0)
      ? `<div class="card"><h3>视频涨跌榜（与对比期同名同发布日视频）</h3><div class="two-col">
          <div><p class="diff-h up">↑ 涨幅 Top 5</p>${diffTableHtml(analysis.videoDiffs.up, 'up')}</div>
          <div><p class="diff-h down">↓ 跌幅 Top 5</p>${diffTableHtml(analysis.videoDiffs.down, 'down')}</div>
        </div></div>`
      : ''
  }

  <div class="card">
    <h3>AI 内容诊断与发布策略建议</h3>
    ${diagnosisHtml(diagnosis)}
  </div>

  <div class="footer">由 HotFlow 生成 · 单文件离线报告</div>
</div>

<script>const REPORT_DATA = ${payload};</script>
${echartsTag}
<script>
  function mk(id, option) {
    var el = document.getElementById(id);
    if (el && window.echarts) echarts.init(el).setOption(option);
  }
  var D = REPORT_DATA;
  if (D.trendLabels.length) {
    mk('trend', {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['播放量', '互动率%'] },
      grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: D.trendLabels, axisLabel: { fontSize: 11 } },
      yAxis: [
        { type: 'value', axisLabel: { formatter: function (v) { return v >= 10000 ? (v / 10000) + '万' : v; } } },
        { type: 'value', axisLabel: { formatter: '{value}%' } }
      ],
      series: [
        { name: '播放量', type: 'line', smooth: true, data: D.trendPlays, itemStyle: { color: '#4f6ef7' }, areaStyle: { opacity: 0.08 } },
        { name: '互动率%', type: 'line', smooth: true, yAxisIndex: 1, data: D.trendEng, itemStyle: { color: '#f59e0b' } }
      ]
    });
  }
  if (D.incLabels.length) {
    mk('inc', {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['净增播放', '净增涨粉'] },
      grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: D.incLabels, axisLabel: { interval: 0, fontSize: 11 } },
      yAxis: [
        { type: 'value' },
        { type: 'value' }
      ],
      series: [
        { name: '净增播放', type: 'bar', data: D.incPlays, itemStyle: { color: '#4f6ef7', borderRadius: [4, 4, 0, 0] } },
        { name: '净增涨粉', type: 'line', yAxisIndex: 1, data: D.incFollows, itemStyle: { color: '#10b981' } }
      ]
    });
  }
  if (D.hourLabels.length) {
    mk('hour', {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['篇均播放', '互动率%'] },
      grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: D.hourLabels, axisLabel: { interval: 0, fontSize: 11 } },
      yAxis: [
        { type: 'value', axisLabel: { formatter: function (v) { return v >= 10000 ? (v / 10000) + '万' : v; } } },
        { type: 'value', axisLabel: { formatter: '{value}%' } }
      ],
      series: [
        { name: '篇均播放', type: 'bar', data: D.hourPlays, itemStyle: { color: '#4f6ef7', borderRadius: [4, 4, 0, 0] } },
        { name: '互动率%', type: 'line', yAxisIndex: 1, data: D.hourEng, itemStyle: { color: '#f59e0b' } }
      ]
    });
  }
  if (D.durLabels.length) {
    mk('duration', {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['平均完播率%', '篇均播放'] },
      grid: { left: 8, right: 8, top: 48, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: D.durLabels, axisLabel: { interval: 0, fontSize: 11 } },
      yAxis: [
        { type: 'value', axisLabel: { formatter: '{value}%' } },
        { type: 'value', axisLabel: { formatter: function (v) { return v >= 10000 ? (v / 10000) + '万' : v; } } }
      ],
      series: [
        { name: '平均完播率%', type: 'bar', data: D.durCompletion, itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } },
        { name: '篇均播放', type: 'bar', yAxisIndex: 1, data: D.durPlays, itemStyle: { color: '#a5b4fc', borderRadius: [4, 4, 0, 0] } }
      ]
    });
  }
</script>
</body>
</html>`
}
