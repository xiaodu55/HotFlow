import OpenAI from 'openai'
import { engagementRateOf } from '@shared/metrics'
import type { AnalysisResult, DiagnosisResult, LlmConfig, Snapshot, VideoRecord } from '@shared/types'

const SYSTEM_PROMPT = `你是一名资深短视频运营专家，负责分析账号的视频数据并给出可执行的运营建议。
用户会提供一份 JSON 数据，包含整体指标、环比变化、发布趋势、分时段表现、时长表现，以及表现最好/最差的视频明细。

请只输出一个 JSON 对象，不要输出任何其他文本、解释或 markdown 代码块。JSON 结构如下：
{
  "summary": "一段 80 字以内的整体表现总结，要引用关键数字",
  "hotPatterns": ["表现好的视频的共性规律，3-5 条，每条引用具体数据佐证"],
  "weakPatterns": ["表现差的视频的问题归因，3-5 条，每条引用具体数据佐证"],
  "titleNotes": "针对标题和封面质量的具体诊断意见，一段话",
  "advicePublishTime": ["基于分时段数据给出的发布时间建议，2-4 条"],
  "adviceTopics": ["基于爆款共性给出的选题方向建议，3-5 条"],
  "adviceActions": ["接下来一周可以直接执行的动作清单，3-5 条，要具体"]
}
所有内容用中文。结论必须来自数据本身，不要编造数据里没有的信息；数据不足以得出结论时，如实说明。`

function compactRecord(r: VideoRecord) {
  return {
    标题: r.title,
    发布时间: r.publishTime ? r.publishTime.slice(5, 16) : null,
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

function buildUserPayload(snapshot: Snapshot, analysis: AnalysisResult): string {
  return JSON.stringify({
    平台: snapshot.platformLabel,
    数据文件: snapshot.fileName,
    视频总数: analysis.totals.videoCount,
    整体指标: analysis.totals,
    与上期环比: analysis.deltas,
    发布趋势: analysis.trend,
    分时段表现: analysis.hourStats,
    时长表现: analysis.durationBuckets,
    播放量最高: analysis.topByPlays.slice(0, 8).map(compactRecord),
    播放量最低: analysis.bottomByPlays.slice(0, 8).map(compactRecord),
    互动率最高: analysis.topByEngagement.slice(0, 5).map(compactRecord)
  })
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
  onChunk?: (text: string) => void
): Promise<DiagnosisResult> {
  if (!isLlmConfigured(cfg)) throw new Error('尚未配置大模型，请先到「设置」页填写 API Key')
  const client = new OpenAI({ apiKey: cfg.apiKey.trim(), baseURL: cfg.baseURL.trim() })
  const stream = await client.chat.completions.create({
    model: cfg.model.trim(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPayload(snapshot, analysis) }
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
  return parseDiagnosis(full, cfg.model)
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
