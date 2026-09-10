import OpenAI from 'openai'
import { analyzeTitles, engagementRateOf } from '@shared/metrics'
import type { AnalysisResult, DiagnosisResult, LlmConfig, Snapshot, VideoRecord } from '@shared/types'

const SYSTEM_PROMPT = `你是一名资深短视频运营专家，负责分析账号的视频数据并给出可执行的运营建议。
用户会提供一份 JSON 数据，包含整体指标、环比变化、净增口径、发布趋势、分时段表现、时长表现、内容等级分组（爆款/优质/正常/低效，按播放中位数与平均互动率划分），以及表现最好/最差的视频明细。

请只输出一个 JSON 对象，不要输出任何其他文本、解释或 markdown 代码块。JSON 结构如下：
{
  "summary": "一段 80 字以内的整体表现总结，要引用关键数字",
  "hotPatterns": ["爆款组和优质组视频的共性规律，3-5 条，引用具体数据佐证"],
  "weakPatterns": ["低效组和正常组中表现偏差视频的问题归因，3-5 条，引用具体数据佐证"],
  "titleNotes": "针对标题和封面质量的具体诊断意见，一段话",
  "advicePublishTime": ["基于分时段数据给出的发布时间建议，2-4 条，注意标注样本量不足的时段"],
  "adviceTopics": ["基于爆款共性给出的选题方向建议，3-5 条"],
  "adviceActions": ["接下来一周可以直接执行的动作清单，3-5 条，要具体"]
}
分析要求：
- 以内容等级分组为主要依据（爆款组共性 vs 低效组归因），播放 Top5 只是参考
- 区分"新视频冷启动差"与"老视频长尾衰减"：发布至今天数短的视频不要轻易判为低效
- 某个时段样本量不足 3 条时，不要基于它给出强结论
所有内容用中文。结论必须来自数据本身，不要编造数据里没有的信息；数据不足以得出结论时，如实说明。

如果用户数据中包含「上期诊断」，请额外在 JSON 中输出一个字段：
"retrospective": ["对照上期建议与本期数据的复盘结论，2-4 条：说明上期哪些建议在本期数据中得到验证、哪些无效、哪些未见执行，引用数据佐证"]
若数据中包含「上期建议执行对照」，请据此判断：按时段发布占比低说明上期建议未见执行；时段内外表现对比说明建议是否有效。
没有「上期诊断」时不要输出 retrospective 字段。`

function daysSince(publishTime: string | null): number | null {
  if (!publishTime) return null
  const t = Date.parse(publishTime)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

function compactRecord(r: VideoRecord) {
  const age = daysSince(r.publishTime)
  return {
    标题: r.title,
    发布时间: r.publishTime ? r.publishTime.slice(5, 16) : null,
    发布至今天数: age,
    时长秒: r.durationSec,
    播放量: r.plays,
    互动率: engagementRateOf(r),
    完播率: r.completionRate,
    点赞: r.likes,
    评论: r.comments,
    分享: r.shares,
    收藏: r.collects
  }
}

function parseHour(publishTime: string | null): number | null {
  if (!publishTime) return null
  const d = new Date(publishTime)
  return Number.isNaN(d.getTime()) ? null : d.getHours()
}

/** 从发布时间建议文本提取小时区间（如「19-22点」「20点到22点」「12点」），解析不出时返回空数组 */
export function extractAdvisedHours(text: string): Array<[number, number]> {
  const windows: Array<[number, number]> = []
  const push = (a: number, b: number): void => {
    if (a <= 23 && b <= 23) windows.push([Math.min(a, b), Math.max(a, b)])
  }
  // 「19-22点」式
  for (const m of text.matchAll(/(\d{1,2})\s*[-~—至到]\s*(\d{1,2})\s*[点时]/g)) push(Number(m[1]), Number(m[2]))
  // 「20点到22点」式（点在数字后）
  for (const m of text.matchAll(/(\d{1,2})\s*[点时]\s*[-~—至到]\s*(\d{1,2})/g)) push(Number(m[1]), Number(m[2]))
  if (windows.length) return windows
  for (const m of text.matchAll(/(\d{1,2})\s*[点时]/g)) push(Number(m[1]), Number(m[1]))
  return windows
}

/** 上期建议执行对照：建议的发布时段 vs 本期实际发布分布与表现，供模型判断建议是否被执行、是否有效 */
export function adviceExecution(
  previous: Pick<DiagnosisResult, 'advicePublishTime'>,
  snapshot: Snapshot
): Record<string, unknown> | null {
  const windows = extractAdvisedHours(previous.advicePublishTime.join('；'))
  if (!windows.length) return null
  const inWindow = (h: number): boolean => windows.some(([a, b]) => h >= a && h <= b)
  const advised = windows.map(([a, b]) => (a === b ? `${a}点` : `${a}-${b}点`))
  const timed = snapshot.records
    .map((r) => ({ r, h: parseHour(r.publishTime) }))
    .filter((x): x is { r: VideoRecord; h: number } => x.h != null)
  if (!timed.length) {
    return { 建议发布时段: advised, 说明: '本期视频均无发布时间信息，无法对照执行情况' }
  }
  const hit = timed.filter((x) => inWindow(x.h))
  const miss = timed.filter((x) => !inWindow(x.h))
  const avgPlays = (list: typeof timed): number | null =>
    list.length ? Math.round(list.reduce((s, x) => s + x.r.plays, 0) / list.length) : null
  return {
    建议发布时段: advised,
    按建议时段发布的占比: `${Math.round((hit.length / timed.length) * 100)}%（${hit.length}/${timed.length}）`,
    建议时段内篇均播放: avgPlays(hit),
    建议时段外篇均播放: avgPlays(miss)
  }
}

function buildUserPayload(
  snapshot: Snapshot,
  analysis: AnalysisResult,
  previous?: DiagnosisResult
): string {
  const levels = analysis.levels
  const grades = analysis.grades
  const byGrade = (grade: string, cap = 10): VideoRecord[] =>
    snapshot.records.filter((r) => grades[r.id] === grade).slice(0, cap)

  const payload: Record<string, unknown> = {
    平台: snapshot.platformLabel,
    账号: snapshot.account || '未命名账号',
    数据文件: snapshot.fileName,
    统计周期: analysis.periodRange,
    视频总数: analysis.totals.videoCount,
    整体累计指标: analysis.totals,
    本期净增_同名视频累计差求和: analysis.increments,
    与上期环比: analysis.deltas,
    净增趋势_相邻两次导入之间: analysis.incrementTrend,
    发布趋势: analysis.trend,
    分时段表现: analysis.hourStats,
    时长表现: analysis.durationBuckets,
    标题话题统计_含平均播放: analyzeTitles(snapshot.records).hashtags,
    标题高频词_含平均播放: analyzeTitles(snapshot.records).topWords,
    播放量最高: analysis.topByPlays.slice(0, 8).map(compactRecord),
    播放量最低: analysis.bottomByPlays.slice(0, 8).map(compactRecord),
    互动率最高: analysis.topByEngagement.slice(0, 5).map(compactRecord)
  }

  if (levels) {
    payload.水位标准 = {
      播放中位数: levels.medianPlays,
      平均互动率: levels.avgEngagementRate,
      分级规则: '爆款=播放≥中位数×2且互动率高于平均；优质=播放≥中位数×2；低效=播放<中位数÷2'
    }
    payload.爆款组 = byGrade('爆款', 10).map(compactRecord)
    payload.低效组 = byGrade('低效', 10).map(compactRecord)
    payload.优质组 = byGrade('优质', 10).map(compactRecord)
  }

  if (previous) {
    payload.上期诊断 = {
      生成时间: previous.generatedAt,
      总结: previous.summary,
      爆款共性: previous.hotPatterns,
      低效归因: previous.weakPatterns,
      发布时间建议: previous.advicePublishTime,
      选题建议: previous.adviceTopics,
      行动清单: previous.adviceActions
    }
    const execution = adviceExecution(previous, snapshot)
    if (execution) payload.上期建议执行对照 = execution
  }

  return JSON.stringify(payload)
}

/** 从模型输出中尽力提取 JSON（容忍 markdown 代码块和前后缀文字） */
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no json object found')
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter((s) => s.trim().length > 0)
}

export function parseDiagnosis(text: string, model: string): DiagnosisResult {
  const generatedAt = new Date().toISOString()
  try {
    const j = extractJson(text)
    const summary = String(j.summary ?? '')
    const hotPatterns = asStringArray(j.hotPatterns)
    const weakPatterns = asStringArray(j.weakPatterns)
    if (!summary && hotPatterns.length === 0 && weakPatterns.length === 0) {
      throw new Error('empty diagnosis')
    }
    return {
      summary: summary || '（模型未给出总结）',
      hotPatterns,
      weakPatterns,
      titleNotes: String(j.titleNotes ?? ''),
      advicePublishTime: asStringArray(j.advicePublishTime),
      adviceTopics: asStringArray(j.adviceTopics),
      adviceActions: asStringArray(j.adviceActions),
      retrospective: j.retrospective != null ? asStringArray(j.retrospective) : undefined,
      model,
      generatedAt
    }
  } catch {
    return {
      summary: '模型输出未能解析为结构化结果，以下为原始输出。',
      hotPatterns: [],
      weakPatterns: [],
      titleNotes: '',
      advicePublishTime: [],
      adviceTopics: [],
      adviceActions: [],
      rawText: text,
      model,
      generatedAt
    }
  }
}

export function isLlmConfigured(cfg: LlmConfig): boolean {
  return Boolean(cfg.apiKey.trim() && cfg.baseURL.trim() && cfg.model.trim())
}

export async function testLlm(cfg: LlmConfig): Promise<{ ok: boolean; message: string }> {
  if (!isLlmConfigured(cfg)) return { ok: false, message: '请先填写完整的 baseURL、API Key 和模型名' }
  try {
    const client = new OpenAI({ apiKey: cfg.apiKey.trim(), baseURL: cfg.baseURL.trim() })
    const res = await client.chat.completions.create({
      model: cfg.model.trim(),
      messages: [{ role: 'user', content: '请只回复两个字：正常' }],
      max_tokens: 16
    })
    const reply = res.choices?.[0]?.message?.content?.trim() ?? ''
    return { ok: true, message: `连接成功，模型回复：${reply || '(空)'}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `连接失败：${msg}` }
  }
}

export async function runDiagnosis(
  cfg: LlmConfig,
  snapshot: Snapshot,
  analysis: AnalysisResult,
  onChunk?: (text: string) => void,
  previous?: DiagnosisResult | null
): Promise<DiagnosisResult> {
  if (!isLlmConfigured(cfg)) throw new Error('尚未配置大模型，请先到「设置」页填写 API Key')
  const client = new OpenAI({ apiKey: cfg.apiKey.trim(), baseURL: cfg.baseURL.trim() })
  const stream = await client.chat.completions.create({
    model: cfg.model.trim(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPayload(snapshot, analysis, previous ?? undefined) }
    ],
    stream: true,
    temperature: 0.4
  })

  let full = ''
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? ''
    if (delta) {
      full += delta
      onChunk?.(delta)
    }
  }
  const diagnosis = parseDiagnosis(full, cfg.model)
  if (previous) {
    diagnosis.retrospective = diagnosis.retrospective ?? []
    diagnosis.previousGeneratedAt = previous.generatedAt
  }
  return diagnosis
}

const FOLLOWUP_SYSTEM = `你是资深短视频运营专家。此前你已经基于该账号的视频运营数据输出过一份诊断报告。
现在用户会针对这份诊断继续提问。请结合此前的诊断结论和下方的原始数据回答问题：
回答要具体、引用数据、可直接执行；用中文；直接输出回答正文，不要输出 JSON 或代码块。`

/** 基于已有诊断继续追问，返回纯文本回答 */
export async function askFollowUp(
  cfg: LlmConfig,
  snapshot: Snapshot,
  analysis: AnalysisResult,
  diagnosis: DiagnosisResult,
  question: string,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!isLlmConfigured(cfg)) throw new Error('尚未配置大模型，请先到「设置」页填写 API Key')
  const client = new OpenAI({ apiKey: cfg.apiKey.trim(), baseURL: cfg.baseURL.trim() })

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: FOLLOWUP_SYSTEM },
    { role: 'user', content: buildUserPayload(snapshot, analysis) }
  ]
  const priorConversation = diagnosis.conversation ?? []
  for (const turn of priorConversation) {
    messages.push({ role: 'user', content: turn.question })
    messages.push({ role: 'assistant', content: turn.answer })
  }
  messages.push({
    role: 'user',
    content: `此前诊断结论要点：${diagnosis.summary}\n爆款共性：${diagnosis.hotPatterns.join('；')}\n\n用户追问：${question}`
  })

  const stream = await client.chat.completions.create({
    model: cfg.model.trim(),
    messages,
    stream: true,
    temperature: 0.4
  })

  let full = ''
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? ''
    if (delta) {
      full += delta
      onChunk?.(delta)
    }
  }
  return full.trim()
}
