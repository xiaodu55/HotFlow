import { unlink, readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { ensureHistoryDir, historyDir } from './paths'
import { logWarn } from './logger'
import type { DiagnosisResult, Snapshot, SnapshotMeta } from '@shared/types'

function snapshotFile(id: string): string {
  return join(historyDir(), `${id}.json`)
}

function metaFile(id: string): string {
  return join(historyDir(), `${id}.meta.json`)
}

function diagnosisFile(id: string): string {
  return join(historyDir(), `${id}.diagnosis.json`)
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  await ensureHistoryDir()
  const { records: _records, ...meta } = snapshot
  void _records
  // meta 文件是派生数据：列表/环比基线查找只需 meta，免去全量快照解析
  await Promise.all([
    writeFile(snapshotFile(snapshot.id), JSON.stringify(snapshot), 'utf-8'),
    writeFile(metaFile(snapshot.id), JSON.stringify(meta), 'utf-8')
  ])
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  await ensureHistoryDir()
  const files = (await readdir(historyDir())).filter((f) => f.endsWith('.json') && !f.includes('.diagnosis'))
  const hasMeta = new Set(files.filter((f) => f.endsWith('.meta.json')))
  const metas: SnapshotMeta[] = []
  for (const f of files) {
    // 已有独立 meta 文件的快照跳过全量解析，避免重复入列
    if (!f.endsWith('.meta.json') && hasMeta.has(`${f.slice(0, -5)}.meta.json`)) continue
    try {
      const parsed = JSON.parse(await readFile(join(historyDir(), f), 'utf-8')) as Partial<Snapshot>
      const { records, ...meta } = parsed
      void records
      // 旧版快照无 account/note 字段，读取时兜底
      metas.push({ account: '', note: '', ...meta } as SnapshotMeta)
    } catch (err) {
      // 单个损坏文件不影响整体列表
      logWarn('history:listSnapshots', err)
    }
  }
  return metas.sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))
}

export async function loadSnapshot(id: string): Promise<Snapshot | null> {
  try {
    const parsed = JSON.parse(await readFile(snapshotFile(id), 'utf-8')) as Partial<Snapshot>
    return { account: '', note: '', ...parsed } as Snapshot
  } catch (err) {
    logWarn('history:loadSnapshot', err)
    return null
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  for (const file of [snapshotFile(id), metaFile(id), diagnosisFile(id)]) {
    await unlink(file).catch(() => undefined)
  }
}

export async function saveDiagnosis(id: string, diagnosis: DiagnosisResult): Promise<void> {
  await ensureHistoryDir()
  await writeFile(diagnosisFile(id), JSON.stringify(diagnosis), 'utf-8')
}

const ARCHIVE_CAP = 10

/** 重新生成诊断前归档旧诊断（每份快照最多保留 10 份历史） */
export async function archiveDiagnosis(id: string, diagnosis: DiagnosisResult): Promise<void> {
  await ensureHistoryDir()
  const file = join(historyDir(), `${id}.diagnosis-archive.json`)
  let list: DiagnosisResult[] = []
  try {
    list = JSON.parse(await readFile(file, 'utf-8')) as DiagnosisResult[]
  } catch (err) {
    logWarn('history:archiveDiagnosis', err)
    list = []
  }
  list.unshift(diagnosis)
  await writeFile(file, JSON.stringify(list.slice(0, ARCHIVE_CAP)), 'utf-8')
}

export async function loadDiagnosis(id: string): Promise<DiagnosisResult | null> {
  try {
    return JSON.parse(await readFile(diagnosisFile(id), 'utf-8')) as DiagnosisResult
  } catch (err) {
    logWarn('history:loadDiagnosis', err)
    return null
  }
}

/** 找同平台、同账号、早于指定导入时间的最近一次导入，用作环比基线 */
export async function findPreviousSnapshot(
  platform: string,
  importedAt: string,
  account = ''
): Promise<SnapshotMeta | null> {
  const metas = await listSnapshots()
  return (
    metas.find((m) => m.platform === platform && (m.account ?? '') === account && m.importedAt < importedAt) ?? null
  )
}
