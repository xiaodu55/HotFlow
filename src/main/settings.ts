import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { DEFAULT_LLM_CONFIG } from '@shared/llm-presets'
import { logWarn } from './logger'
import { writeFileAtomic } from './atomic'
import type { AppSettings, LlmConfig } from '@shared/types'

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

const DEFAULT_SETTINGS: AppSettings = { llm: { ...DEFAULT_LLM_CONFIG } }

/** 落盘形态：API Key 加密为 apiKeyEncrypted（base64），不存明文；safeStorage 不可用时回退明文 apiKey */
interface PersistedLlm extends LlmConfig {
  apiKeyEncrypted?: string
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'ENOENT'
}

function decryptApiKey(encrypted: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch (err) {
    logWarn('settings:decryptApiKey', err)
    return null
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<{ llm: PersistedLlm; windowBounds: AppSettings['windowBounds'] }>
    const { apiKeyEncrypted, ...llm } = { ...DEFAULT_LLM_CONFIG, ...(parsed.llm ?? {}) }
    if (apiKeyEncrypted) {
      const decrypted = decryptApiKey(apiKeyEncrypted)
      if (decrypted != null) llm.apiKey = decrypted
    }
    return { llm, windowBounds: parsed.windowBounds }
  } catch (err) {
    // 首次启动/文件缺失属正常路径，损坏时留下日志便于排查
    if (!isNotFound(err)) logWarn('settings:loadSettings', err)
    return { ...DEFAULT_SETTINGS, llm: { ...DEFAULT_LLM_CONFIG } }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const persisted: { llm: PersistedLlm; windowBounds?: AppSettings['windowBounds'] } = {
    llm: { ...settings.llm },
    windowBounds: settings.windowBounds
  }
  try {
    if (persisted.llm.apiKey && safeStorage.isEncryptionAvailable()) {
      persisted.llm.apiKeyEncrypted = safeStorage.encryptString(persisted.llm.apiKey).toString('base64')
      persisted.llm.apiKey = ''
    }
  } catch (err) {
    // 加密失败时保留明文回退，可用性优先
    logWarn('settings:encryptApiKey', err)
  }
  await writeFileAtomic(settingsFile(), JSON.stringify(persisted, null, 2))
}
