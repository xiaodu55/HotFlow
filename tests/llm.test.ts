import { describe, expect, it } from 'vitest'
import { parseDiagnosis } from '../src/main/llm'

describe('parseDiagnosis（LLM 输出容错解析）', () => {
  const base = {
    summary: '整体向好',
    hotPatterns: ['晚8点播放高'],
    weakPatterns: ['早晨发布低迷'],
    titleNotes: '标题偏平',
    advicePublishTime: ['建议19-22点发布'],
    adviceTopics: ['校园美食'],
    adviceActions: ['固定更新时间']
  }

  it('解析纯净 JSON', () => {
    const d = parseDiagnosis(JSON.stringify(base), 'test-model')
    expect(d.summary).toBe('整体向好')
    expect(d.hotPatterns).toHaveLength(1)
    expect(d.rawText).toBeUndefined()
    expect(d.model).toBe('test-model')
  })

  it('解析 markdown 代码块包裹的 JSON', () => {
    const text = '```json\n' + JSON.stringify(base) + '\n```'
    const d = parseDiagnosis(text, 'm')
    expect(d.summary).toBe('整体向好')
    expect(d.adviceActions).toHaveLength(1)
  })

  it('解析带前后杂文的 JSON', () => {
    const text = '好的，以下是分析结果：\n' + JSON.stringify(base) + '\n希望对你有帮助。'
    const d = parseDiagnosis(text, 'm')
    expect(d.summary).toBe('整体向好')
  })

  it('完全无法解析时保留原文', () => {
    const d = parseDiagnosis('这不是 JSON 输出，模型跑偏了。', 'm')
    expect(d.summary).toContain('未能解析')
    expect(d.rawText).toBe('这不是 JSON 输出，模型跑偏了。')
    expect(d.hotPatterns).toHaveLength(0)
  })

  it('关键字段缺失（空对象）时走原文兜底', () => {
    const d = parseDiagnosis('{}', 'm')
    expect(d.rawText).toBe('{}')
  })

  it('字段类型异常时安全转空数组', () => {
    const d = parseDiagnosis(JSON.stringify({ ...base, hotPatterns: '不是数组', adviceTopics: 42 }), 'm')
    expect(d.hotPatterns).toHaveLength(0)
    expect(d.adviceTopics).toHaveLength(0)
    expect(d.summary).toBe('整体向好')
  })
})
