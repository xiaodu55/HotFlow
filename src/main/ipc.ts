import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { computeIncrementTrend, computeIncrements, runAnalysis } from '@shared/metrics'
import type { AppSettings, LlmConfig } from '@shared/types'
import { createBackup, restoreBackup } from './backup'
import { importFromFile, inspectTable, type ImportMeta } from './ingest'
import {
  archiveDiagnosis,
  deleteSnapshot,
  findPreviousSnapshot,
  listSnapshots,
  loadDiagnosis,
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

export function registerIpc(): void {
  ipcMain.handle('app:pickAndImport', async (e, platformId: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? ({} as never), {
      title: '选择平台导出的数据表格',
      filters: [{ name: '表格文件', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return { snapshot: await importFromFile(res.filePaths[0], platformId) }
  })

  ipcMain.handle('app:inspectTable', async (_e, filePath: string, platformId: string) =>
    inspectTable(filePath, platformId)
  )

  ipcMain.handle('app:importFile', async (_e, filePath: string, platformId: string, meta?: ImportMeta) => ({
    snapshot: await importFromFile(filePath, platformId, meta)
  }))

  ipcMain.handle('app:listSnapshots', () => listSnapshots())

  ipcMain.handle('app:getSnapshot', async (_e, id: string) => {
    const snapshot = await loadSnapshot(id)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    return { snapshot, diagnosis: await loadDiagnosis(id) }
  })

  ipcMain.handle('app:deleteSnapshot', (_e, id: string) => deleteSnapshot(id))

  ipcMain.handle('app:runAnalysis', async (_e, snapshotId: string, compareId?: string) => {
    const snapshot = await loadSnapshot(snapshotId)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    const compare = await resolveCompare(snapshot.platform, snapshot.importedAt, snapshot.account, compareId)
    const chain = await loadAccountChain(snapshot.platform, snapshot.account, snapshot.importedAt)
    return runAnalysis(snapshot, compare, computeIncrementTrend(chain))
  })

  ipcMain.handle('app:getSettings', () => loadSettings())
  ipcMain.handle('app:saveSettings', (_e, settings: AppSettings) => saveSettings(settings))
  ipcMain.handle('app:testLlm', async (_e, cfg: LlmConfig) => testLlm(cfg))

  ipcMain.handle('app:runDiagnosis', async (e, snapshotId: string, compareId?: string) => {
    const snapshot = await loadSnapshot(snapshotId)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    const settings = await loadSettings()
    const compare = await resolveCompare(snapshot.platform, snapshot.importedAt, snapshot.account, compareId)
    const analysis = runAnalysis(snapshot, compare)
    const previous = await loadDiagnosis(snapshotId)
    const diagnosis = await runDiagnosis(settings.llm, snapshot, analysis, (text) => {
      if (!e.sender.isDestroyed()) e.sender.send('llm:chunk', text)
    }, previous)
    // 重新生成时归档旧诊断（策略闭环：旧建议不丢失）
    if (previous) await archiveDiagnosis(snapshotId, previous)
    await saveDiagnosis(snapshotId, diagnosis)
    return diagnosis
  })

  ipcMain.handle('app:askDiagnosis', async (e, snapshotId: string, question: string) => {
    const snapshot = await loadSnapshot(snapshotId)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    const diagnosis = await loadDiagnosis(snapshotId)
    if (!diagnosis) throw new Error('请先生成 AI 诊断，再进行追问')
    const settings = await loadSettings()
    const compare = await resolveCompare(snapshot.platform, snapshot.importedAt, snapshot.account)
    const analysis = runAnalysis(snapshot, compare)
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

  ipcMain.handle('app:buildReport', async (_e, snapshotId: string, compareId?: string) => {
    const snapshot = await loadSnapshot(snapshotId)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    const compare = await resolveCompare(snapshot.platform, snapshot.importedAt, snapshot.account, compareId)
    const analysis = runAnalysis(snapshot, compare)
    const diagnosis = await loadDiagnosis(snapshotId)
    return { html: buildReportHtml(analysis, diagnosis) }
  })

  ipcMain.handle('app:exportReport', async (e, snapshotId: string, compareId?: string) => {
    const snapshot = await loadSnapshot(snapshotId)
    if (!snapshot) throw new Error('数据快照不存在或已被删除')
    const compare = await resolveCompare(snapshot.platform, snapshot.importedAt, snapshot.account, compareId)
    const analysis = runAnalysis(snapshot, compare)
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
    return { canceled: false, ...stats }
  })
}
