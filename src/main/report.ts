import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { engagementRateOf } from '@shared/metrics'
import type { AnalysisResult, DiagnosisResult, VideoRecord } from '@shared/types'

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

function diagnosisHtml(diagnosis: DiagnosisResult | null): string {
  if (!diagnosis) {
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
  if (diagnosis.model) {
    parts.push(`<p class="diag-meta">由 ${esc(diagnosis.model)} 于 ${esc(fmtTime(diagnosis.generatedAt))} 生成</p>`)
  }
  return parts.join('')
}

export function buildReportHtml(analysis: AnalysisResult, diagnosis: DiagnosisResult | null): string {
  const { totals, deltas } = analysis
  const compareNote = analysis.compareSnapshot
    ? `环比对象：${esc(analysis.compareSnapshot.fileName)}（${esc(fmtTime(analysis.compareSnapshot.importedAt))} 导入）`
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

  const granularityNote =
    analysis.trendGranularity === 'day' ? '按日' : analysis.trendGranularity === 'week' ? '按周' : '按月'

  const lib = loadEchartsJs()
  const echartsTag = lib
    ? `<script>${lib}</script>`
    : `<script src="https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js"></script>`

  const payload = JSON.stringify({ trendLabels, trendPlays, trendEng, hourLabels, hourPlays, hourEng, durLabels, durCompletion, durPlays }).replace(/</g, '\\u003c')

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
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>HotFlow 视频运营分析报告</h1>
    <div class="meta">
      数据来源：${esc(analysis.snapshot.platformLabel)} · ${esc(analysis.snapshot.fileName)}（${analysis.snapshot.recordCount} 条视频）<br>
      导入时间：${esc(fmtTime(analysis.snapshot.importedAt))} · 报告生成：${esc(fmtTime(analysis.generatedAt))}<br>
      ${compareNote}
    </div>
  </div>

  <div class="card">
    <h3>核心指标${deltas ? '' : '（暂无上期环比）'}</h3>
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
    analysis.trend.length
      ? `<div class="card"><h3>发布趋势（${granularityNote}）</h3><div id="trend" class="chart"></div></div>`
      : ''
  }
  ${analysis.hourStats.length ? `<div class="card"><h3>发布时段 × 平均表现</h3><div id="hour" class="chart"></div></div>` : ''}
  ${analysis.durationBuckets.length ? `<div class="card"><h3>视频时长 × 平均表现</h3><div id="duration" class="chart"></div></div>` : ''}

  <div class="card">
    <h3>表现最好 Top 5（按播放量）</h3>
    ${recordTable(analysis.topByPlays, 'good')}
  </div>
  <div class="card">
    <h3>表现最差 Bottom 5（按播放量）</h3>
    ${recordTable(analysis.bottomByPlays, 'bad')}
  </div>

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
      legend: { data: ['播放量', '互动率%'] },
      grid: { left: 60, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: D.trendLabels },
      yAxis: [
        { type: 'value', name: '播放量', axisLabel: { formatter: function (v) { return v >= 10000 ? (v / 10000) + '万' : v; } } },
        { type: 'value', name: '互动率%', axisLabel: { formatter: '{value}%' } }
      ],
      series: [
        { name: '播放量', type: 'line', smooth: true, data: D.trendPlays, itemStyle: { color: '#4f6ef7' }, areaStyle: { opacity: 0.08 } },
        { name: '互动率%', type: 'line', smooth: true, yAxisIndex: 1, data: D.trendEng, itemStyle: { color: '#f59e0b' } }
      ]
    });
  }
  if (D.hourLabels.length) {
    mk('hour', {
      tooltip: { trigger: 'axis' },
      legend: { data: ['篇均播放', '互动率%'] },
      grid: { left: 60, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: D.hourLabels },
      yAxis: [
        { type: 'value', name: '篇均播放', axisLabel: { formatter: function (v) { return v >= 10000 ? (v / 10000) + '万' : v; } } },
        { type: 'value', name: '互动率%', axisLabel: { formatter: '{value}%' } }
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
      legend: { data: ['平均完播率%', '篇均播放'] },
      grid: { left: 60, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: D.durLabels },
      yAxis: [
        { type: 'value', name: '完播率%', axisLabel: { formatter: '{value}%' } },
        { type: 'value', name: '篇均播放', axisLabel: { formatter: function (v) { return v >= 10000 ? (v / 10000) + '万' : v; } } }
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
