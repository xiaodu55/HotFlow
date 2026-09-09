import { app } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'

export function historyDir(): string {
  return join(app.getPath('userData'), 'history')
}

export async function ensureHistoryDir(): Promise<string> {
  const dir = historyDir()
  await mkdir(dir, { recursive: true })
  return dir
}
