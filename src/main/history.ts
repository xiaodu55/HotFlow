import { unlink, readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { ensureHistoryDir, historyDir } from './paths'
import type { DiagnosisResult, Snapshot, SnapshotMeta } from '@shared/types'

function snapshotFile(id: string): string {
  return join(historyDir(), `${id}.json`)
}

function diagnosisFile(id: string): string {
  return join(historyDir(), `${id}.diagnosis.json`)
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  await ensureHistoryDir()
  await writeFile(snapshotFile(snapshot.id), JSON.stringify(snapshot), 'utf-8')
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  await ensureHistoryDir()
  const files = await readdir(historyDir())
  const metas: SnapshotMeta[] = []
  for (const f of files) {
    if (!f.endsWith('.json') || f.endsWith('.diagnosis.json')) continue
    try {
      const snap = JSON.parse(await readFile(join(historyDir(), f), 'utf-8')) as Snapshot
      const { records, ...meta } = snap
      metas.push(meta)
    } catch {
      // 单个损坏文件不影响整体列表
    }
  }
  return metas.sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))
}

export async function loadSnapshot(id: string): Promise<Snapshot | null> {
  try {
    return JSON.parse(await readFile(snapshotFile(id), 'utf-8')) as Snapshot
  } catch {
    return null
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  for (const file of [snapshotFile(id), diagnosisFile(id)]) {
    await unlink(file).catch(() => undefined)
  }
}

export async function saveDiagnosis(id: string, diagnosis: DiagnosisResult): Promise<void> {
  await ensureHistoryDir()
  await writeFile(diagnosisFile(id), JSON.stringify(diagnosis), 'utf-8')
}

export async function loadDiagnosis(id: string): Promise<DiagnosisResult | null> {
  try {
    return JSON.parse(await readFile(diagnosisFile(id), 'utf-8')) as DiagnosisResult
  } catch {
    return null
  }
}

/** 找同平台、早于指定导入时间的最近一次导入，用作环比基线 */
export async function findPreviousSnapshot(platform: string, importedAt: string): Promise<SnapshotMeta | null> {
  const metas = await listSnapshots()
  return metas.find((m) => m.platform === platform && m.importedAt < importedAt) ?? null
}
