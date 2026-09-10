import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { computeIncrementTrend, computeIncrements, runAnalysis } from '@shared/metrics'
import type { AnalysisResult, AppSettings, LlmConfig, Snapshot } from '@shared/types'
import { createBackup, restoreBackup } from './backup'
import { importFromFile, inspectTable, type ImportMeta } from './ingest'
import {
  archiveDiagnosis,
  deleteSnapshot,
  findPreviousDiagnosis,
  findPreviousSnapshot,
  listSnapshots,
  loadDiagnosis,
  loadDiagnosisArchive,
  loadSnapshot,
  saveDiagnosis
} from './history'
import { askFollowUp, runDiagnosis, testLlm } from './llm'
import { buildReportHtml } from './report'
import { loadSettings, saveSettings } from './settings'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 解析对比期：显式指定用显式值，否则自动选同平台同账号的上一次导入 */
async function resolveCompare(snapshotPlatform: string, snapshotImportedAt: string, snapshotAccount = '', compareId?: string) {
  if (compareId) return loadSnapshot(compareId)
  const meta = await findPreviousSnapshot(snapshotPlatform, snapshotImportedAt, snapshotAccount)
  return meta ? loadSnapshot(meta.id) : null
}

/** 同平台同账号、不晚于指定时间的全部快照（升序），用于净增趋势 */
async function loadAccountChain(platform: string, account = '', importedAt: string) {
  const metas = (await listSnapshots()).filter(
    (m) => m.platform === platform && (m.account ?? '') === account && m.importedAt <= importedAt
  )
  const snaps = (await Promise.all(metas.map((m) => loadSnapshot(m.id)))).filter(
    (s): s is NonNullable<typeof s> => s != null
  )
  return snaps.sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1))
}

interface AnalysisBundle {
  snapshot: Snapshot
  compare: Snapshot | null
  analysis: AnalysisResult
}

/** 分析结果缓存：同一「快照+对比期」只读盘计算一次，切换页面/反复导出不再重算。
 *  快照数据仅在导入、删除、恢复备份时变化，这些操作完成后必须 clearAnalysisCache() */
const analysisCache = new Map<string, AnalysisBundle>()

function clearAnalysisCache(): void {
  analysisCache.clear()
}

/** 计算或复用分析结果。统一走净增趋势链，看板/诊断/报告口径一致 */
async function getAnalysisBundle(snapshotId: string, compareId?: string): Promise<AnalysisBundle> {
  const key = `${snapshotId}|${compareId ?? ''}`
  const cached = analysisCache.get(key)
  if (cached) {
    return { ...cached, analysis: { ...cached.analysis, generatedAt: new Date().toISOString() } }
  }
  const snapshot = await loadSnapshot(snapshotId)
  if (!snapshot) throw new Error('数据快照不存在或已被删除')
  const compare = await resolveCompare(snapshot.platform, snapshot.importedAt, snapshot.account, compareId)
  const chain = await loadAccountChain(snapshot.platform, snapshot.account, snapshot.importedAt)
  const analysis = runAnalysis(snapshot, compare, computeIncrementTrend(chain))
  const bundle: AnalysisBundle = { snapshot, compare, analysis }
  // 缓存持有完整快照记录，限制条数防内存膨胀
  if (analysisCache.size >= 8) analysisCache.clear()
  analysisCache.set(key, bundle)
  return bundle
}

export function registerIpc(): void {
  ipcMain.handle('app:pickAndImport', async (e, platformId: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? ({} as never), {
      title: '选择平台导出的数据表格',
      filters: [{ name: '表格文件', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const snapshot = await importFromFile(res.filePaths[0], platformId)
    clearAnalysisCache()
    return { snapshot }
  })

  ipcMain.handle('app:inspectTable', async (_e, filePath: string, platformId: string) =>
    inspectTable(filePath, platformId)
  )

  ipcMain.handle('app:importFile', async (_e, filePath: string, platformId: string, meta?: ImportMeta) => {
    const snapshot = await importFromFile(filePath, platformId, meta)
    clearAnalysisCache()
    return { snapshot }
  })

  ipcMain.handle('app:listSnapshots', () => listSnapshots())

  ipcMain.handle('app:getSnapshot', async (_e, id: string) => {
    const snapshot = await loadSnapshot(id)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    return { snapshot, diagnosis: await loadDiagnosis(id) }
  })

  ipcMain.handle('app:deleteSnapshot', async (_e, id: string) => {
    await deleteSnapshot(id)
    clearAnalysisCache()
  })

  ipcMain.handle('app:runAnalysis', async (_e, snapshotId: string, compareId?: string) => {
    const { analysis } = await getAnalysisBundle(snapshotId, compareId)
    return analysis
  })

  ipcMain.handle('app:getSettings', () => loadSettings())
  ipcMain.handle('app:saveSettings', (_e, settings: AppSettings) => saveSettings(settings))
  ipcMain.handle('app:testLlm', async (_e, cfg: LlmConfig) => testLlm(cfg))

  ipcMain.handle('app:runDiagnosis', async (e, snapshotId: string, compareId?: string) => {
    const { snapshot, analysis } = await getAnalysisBundle(snapshotId, compareId)
    const settings = await loadSettings()
    // 同快照重新生成→复用自己的旧诊断；首次诊断→回退同账号上一期的诊断（策略闭环）
    const previous =
      (await loadDiagnosis(snapshotId)) ??
      (await findPreviousDiagnosis(snapshot.platform, snapshot.importedAt, snapshot.account))
    const diagnosis = await runDiagnosis(settings.llm, snapshot, analysis, (text) => {
      if (!e.sender.isDestroyed()) e.sender.send('llm:chunk', text)
    }, previous)
    // 重新生成时归档旧诊断（策略闭环：旧建议不丢失）
    if (previous) await archiveDiagnosis(snapshotId, previous)
    await saveDiagnosis(snapshotId, diagnosis)
    return diagnosis
  })

  ipcMain.handle('app:askDiagnosis', async (e, snapshotId: string, question: string) => {
    const { snapshot, analysis } = await getAnalysisBundle(snapshotId)
    const diagnosis = await loadDiagnosis(snapshotId)
    if (!diagnosis) throw new Error('请先生成 AI 诊断，再进行追问')
    const settings = await loadSettings()
    const answer = await askFollowUp(settings.llm, snapshot, analysis, diagnosis, question, (text) => {
      if (!e.sender.isDestroyed()) e.sender.send('llm:chunk', text)
    })
    const updated: typeof diagnosis = {
      ...diagnosis,
      conversation: [...(diagnosis.conversation ?? []), { question, answer }]
    }
    await saveDiagnosis(snapshotId, updated)
    return updated
  })

  ipcMain.handle('app:getStrategyReview', async (_e, snapshotId: string) => {
    const snapshot = await loadSnapshot(snapshotId)
    if (!snapshot) return { previous: null, retrospective: [], previousGeneratedAt: null }
    const archive = await loadDiagnosisArchive(snapshotId)
    const current = await loadDiagnosis(snapshotId)
    // 上期建议：优先取被接替的归档诊断，否则回退同账号上一期的诊断
    const previous =
      archive[0] ?? (await findPreviousDiagnosis(snapshot.platform, snapshot.importedAt, snapshot.account))
    return {
      previous,
      retrospective: current?.retrospective ?? [],
      previousGeneratedAt: current?.previousGeneratedAt ?? null
    }
  })

  ipcMain.handle('app:buildReport', async (_e, snapshotId: string, compareId?: string) => {
    const { analysis } = await getAnalysisBundle(snapshotId, compareId)
    const diagnosis = await loadDiagnosis(snapshotId)
    return { html: buildReportHtml(analysis, diagnosis) }
  })

  ipcMain.handle('app:exportReport', async (e, snapshotId: string, compareId?: string) => {
    const { analysis } = await getAnalysisBundle(snapshotId, compareId)
    const diagnosis = await loadDiagnosis(snapshotId)
    const html = buildReportHtml(analysis, diagnosis)

    const win = BrowserWindow.fromWebContents(e.sender)
    const d = new Date()
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
    const res = await dialog.showSaveDialog(win ?? ({} as never), {
      title: '导出分析报告',
      defaultPath: `HotFlow_运营分析报告_${stamp}.html`,
      filters: [{ name: 'HTML 报告', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeFile(res.filePath, html, 'utf-8')
    return { canceled: false, path: res.filePath }
  })

  ipcMain.handle('app:exportBackup', async (e) => {
    const backup = await createBackup()
    const win = BrowserWindow.fromWebContents(e.sender)
    const d = new Date()
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    const res = await dialog.showSaveDialog(win ?? ({} as never), {
      title: '导出全部数据备份',
      defaultPath: `HotFlow_备份_${stamp}.json`,
      filters: [{ name: 'HotFlow 备份', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeFile(res.filePath, JSON.stringify(backup, null, 2), 'utf-8')
    return { canceled: false, path: res.filePath, snapshots: backup.snapshots.length }
  })

  ipcMain.handle('app:importBackup', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? ({} as never), {
      title: '选择备份文件',
      filters: [{ name: 'HotFlow 备份', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const raw = await readFile(res.filePaths[0], 'utf-8')
    const stats = await restoreBackup(raw)
    clearAnalysisCache()
    return { canceled: false, ...stats }
  })

  // 内置示例数据：打包后在 resources/samples，开发时在项目 samples/
  const sampleDir = (): string =>
    app.isPackaged ? join(process.resourcesPath, 'samples') : join(app.getAppPath(), 'samples')

  ipcMain.handle('app:loadSampleData', async () => {
    const outcomes = [
      await importFromFile(join(sampleDir(), 'sample_douyin_period1.xlsx'), 'douyin', {
        account: '示例账号',
        note: '7月数据'
      }),
      await importFromFile(join(sampleDir(), 'sample_douyin_period2.xlsx'), 'douyin', {
        account: '示例账号',
        note: '8月数据'
      })
    ]
    clearAnalysisCache()
    return { count: outcomes.length }
  })
}
