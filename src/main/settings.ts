import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { DEFAULT_LLM_CONFIG } from '@shared/llm-presets'
import { logWarn } from './logger'
import type { AppSettings } from '@shared/types'

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

const DEFAULT_SETTINGS: AppSettings = { llm: { ...DEFAULT_LLM_CONFIG } }

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      llm: { ...DEFAULT_LLM_CONFIG, ...(parsed.llm ?? {}) },
      windowBounds: parsed.windowBounds
    }
  } catch (err) {
    // 首次启动/文件缺失属正常路径，损坏时留下日志便于排查
    logWarn('settings:loadSettings', err)
    return { ...DEFAULT_SETTINGS, llm: { ...DEFAULT_LLM_CONFIG } }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
}
