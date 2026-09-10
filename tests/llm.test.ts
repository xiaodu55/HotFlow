import { tmpdir } from 'os'
import { describe, expect, it, vi } from 'vitest'
import { adviceExecution, extractAdvisedHours, parseDiagnosis } from '../src/main/llm'
import type { DiagnosisResult, Snapshot, VideoRecord } from '../src/shared/types'

// llm.ts 间接引入 logger → electron，测试环境指向系统临时目录
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => tmpdir()) }
}))

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

  it('含 retrospective 字段时保留（策略闭环）', () => {
    const d = parseDiagnosis(JSON.stringify({ ...base, retrospective: ['上期建议晚8点发布已验证有效'] }), 'm')
    expect(d.retrospective).toEqual(['上期建议晚8点发布已验证有效'])
  })

  it('无 retrospective 字段时为 undefined（首期诊断）', () => {
    const d = parseDiagnosis(JSON.stringify(base), 'm')
    expect(d.retrospective).toBeUndefined()
  })
})

describe('extractAdvisedHours（建议时段解析）', () => {
  it('解析区间建议', () => {
    expect(extractAdvisedHours('建议 19-22点 发布；也可 20点到22点')).toEqual([
      [19, 22],
      [20, 22]
    ])
  })
  it('解析单点建议', () => {
    expect(extractAdvisedHours('中午 12点 效果好')).toEqual([[12, 12]])
  })
  it('无时段信息时返回空数组', () => {
    expect(extractAdvisedHours('建议结合校园热点选题')).toEqual([])
  })
})

describe('adviceExecution（建议执行对照）', () => {
  const previous = { advicePublishTime: ['建议 19-22点 发布'] } as Pick<DiagnosisResult, 'advicePublishTime'>
  const rec = (partial: Partial<VideoRecord>): VideoRecord => ({
    id: 'v0',
    title: '测试',
    publishTime: null,
    durationSec: null,
    plays: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    collects: 0,
    followsGained: null,
    completionRate: null,
    avgWatchSec: null,
    ...partial
  })
  const snap = (records: VideoRecord[]): Snapshot => ({
    id: 'p2',
    platform: 'douyin',
    platformLabel: '抖音',
    account: '',
    note: '',
    fileName: 'p2.xlsx',
    importedAt: 'p2',
    recordCount: records.length,
    warnings: [],
    unmappedColumns: [],
    records
  })

  it('计算按建议时段发布的占比与内外表现对比', () => {
    const result = adviceExecution(previous, snap([
      rec({ publishTime: '2026-08-01 20:00:00', plays: 1000 }),
      rec({ publishTime: '2026-08-02 21:00:00', plays: 2000 }),
      rec({ publishTime: '2026-08-03 08:00:00', plays: 300 })
    ]))
    expect(result).not.toBeNull()
    expect(result['建议发布时段']).toEqual(['19-22点'])
    expect(result['按建议时段发布的占比']).toBe('67%（2/3）')
    expect(result['建议时段内篇均播放']).toBe(1500)
    expect(result['建议时段外篇均播放']).toBe(300)
  })
  it('建议无时段信息时不生成对照', () => {
    expect(adviceExecution({ advicePublishTime: ['选题再聚焦校园'] }, snap([]))).toBeNull()
  })
  it('本期全部无发布时间时如实说明', () => {
    const result = adviceExecution(previous, snap([rec({ plays: 10 })]))
    expect(result).not.toBeNull()
    expect(result['说明']).toContain('无发布时间')
  })
})
