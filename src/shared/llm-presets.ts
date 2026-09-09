import type { LlmProviderId } from './types'

export interface LlmPreset {
  id: LlmProviderId
  label: string
  baseURL: string
  defaultModel: string
  note: string
  applyUrl: string
}

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    note: '性价比高，国内直连，适合数据分析类任务',
    applyUrl: 'https://platform.deepseek.com'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    note: 'glm-4-flash 免费，适合轻量使用',
    applyUrl: 'https://open.bigmodel.cn'
  },
  {
    id: 'dashscope',
    label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    note: '阿里百炼，OpenAI 兼容模式',
    applyUrl: 'https://bailian.console.aliyun.com'
  },
  {
    id: 'custom',
    label: '自定义 / 其他兼容接口',
    baseURL: '',
    defaultModel: '',
    note: '任意 OpenAI 兼容接口（Ollama、vLLM、OneAPI 等）',
    applyUrl: ''
  }
]

export function getPreset(id: LlmProviderId): LlmPreset {
  return LLM_PRESETS.find((p) => p.id === id) ?? LLM_PRESETS[LLM_PRESETS.length - 1]
}

export const DEFAULT_LLM_CONFIG = {
  provider: 'deepseek' as LlmProviderId,
  baseURL: getPreset('deepseek').baseURL,
  apiKey: '',
  model: getPreset('deepseek').defaultModel
}
