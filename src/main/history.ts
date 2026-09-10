import { unlink, readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { ensureHistoryDir, historyDir } from './paths'
import { logWarn } from './logger'
import { writeFileAtomic } from './atomic'
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
    writeFileAtomic(snapshotFile(snapshot.id), JSON.stringify(snapshot)),
    writeFileAtomic(metaFile(snapshot.id), JSON.stringify(meta))
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
    if (!isNotFound(err)) logWarn('history:loadSnapshot', err)
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
  await writeFileAtomic(diagnosisFile(id), JSON.stringify(diagnosis))
}

const ARCHIVE_CAP = 10

function diagnosisArchiveFile(id: string): string {
  return join(historyDir(), `${id}.diagnosis-archive.json`)
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'ENOENT'
}

/** 重新生成诊断前归档旧诊断（每份快照最多保留 10 份历史） */
export async function archiveDiagnosis(id: string, diagnosis: DiagnosisResult): Promise<void> {
  await ensureHistoryDir()
  let list: DiagnosisResult[] = []
  try {
    list = JSON.parse(await readFile(diagnosisArchiveFile(id), 'utf-8')) as DiagnosisResult[]
  } catch (err) {
    if (!isNotFound(err)) logWarn('history:archiveDiagnosis', err)
    list = []
  }
  list.unshift(diagnosis)
  await writeFileAtomic(diagnosisArchiveFile(id), JSON.stringify(list.slice(0, ARCHIVE_CAP)))
}

/** 诊断归档（按时间倒序，[0] 为最近被接替的一份） */
export async function loadDiagnosisArchive(id: string): Promise<DiagnosisResult[]> {
  try {
    const list = JSON.parse(await readFile(diagnosisArchiveFile(id), 'utf-8')) as DiagnosisResult[]
    return Array.isArray(list) ? list : []
  } catch (err) {
    if (!isNotFound(err)) logWarn('history:loadDiagnosisArchive', err)
    return []
  }
}

export async function loadDiagnosis(id: string): Promise<DiagnosisResult | null> {
  try {
    return JSON.parse(await readFile(diagnosisFile(id), 'utf-8')) as DiagnosisResult
  } catch (err) {
    if (!isNotFound(err)) logWarn('history:loadDiagnosis', err)
    return null
  }
}

/** 跨期策略闭环：找同平台、同账号、早于指定导入时间的最近一份诊断（上期建议来源） */
export async function findPreviousDiagnosis(
  platform: string,
  importedAt: string,
  account = ''
): Promise<DiagnosisResult | null> {
  const metas = (await listSnapshots()).filter(
    (m) => m.platform === platform && (m.account ?? '') === account && m.importedAt < importedAt
  )
  for (const m of metas) {
    const d = await loadDiagnosis(m.id)
    // 跳过解析失败的诊断（rawText 兜底型），结构化建议才有复盘价值
    if (d && !d.rawText) return d
  }
  return null
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
