import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { DEFAULT_LLM_CONFIG } from '@shared/llm-presets'
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
      llm: { ...DEFAULT_LLM_CONFIG, ...(parsed.llm ?? {}) }
    }
  } catch {
    return { ...DEFAULT_SETTINGS, llm: { ...DEFAULT_LLM_CONFIG } }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
}
