import { readFile } from 'fs/promises'
import { listSnapshots, loadSnapshot, saveSnapshot } from './history'
import { loadSettings, saveSettings } from './settings'
import type { AppSettings, Snapshot } from '@shared/types'

export interface BackupFile {
  version: 1
  app: 'hotflow'
  exportedAt: string
  settings: AppSettings
  snapshots: Snapshot[]
}

export async function createBackup(): Promise<BackupFile> {
  const metas = await listSnapshots()
  const snapshots = (await Promise.all(metas.map((m) => loadSnapshot(m.id)))).filter(
    (s): s is Snapshot => s != null
  )
  const settings = await loadSettings()
  return { version: 1, app: 'hotflow', exportedAt: new Date().toISOString(), settings, snapshots }
}

export async function restoreBackup(raw: string): Promise<{ snapshots: number; settings: boolean }> {
  let data: Partial<BackupFile>
  try {
    data = JSON.parse(raw) as Partial<BackupFile>
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (data?.app !== 'hotflow' || !Array.isArray(data.snapshots)) {
    throw new Error('不是有效的 HotFlow 备份文件')
  }

  let count = 0
  for (const snap of data.snapshots) {
    if (!snap?.id || !Array.isArray(snap.records)) continue
    // 同名 id 覆盖、新快照追加；旧备份无 account/note 时兜底
    await saveSnapshot({ ...snap, account: snap.account ?? '', note: snap.note ?? '' })
    count++
  }

  let settingsRestored = false
  if (data.settings?.llm) {
    await saveSettings(data.settings)
    settingsRestored = true
  }
  return { snapshots: count, settings: settingsRestored }
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8')
}
