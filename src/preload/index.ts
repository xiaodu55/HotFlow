import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '@shared/api'

const api: Api = {
  pickAndImport: (platformId) => ipcRenderer.invoke('app:pickAndImport', platformId),
  inspectTable: (filePath, platformId) => ipcRenderer.invoke('app:inspectTable', filePath, platformId),
  importFile: (filePath, platformId) => ipcRenderer.invoke('app:importFile', filePath, platformId),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  listSnapshots: () => ipcRenderer.invoke('app:listSnapshots'),
  getSnapshot: (id) => ipcRenderer.invoke('app:getSnapshot', id),
  deleteSnapshot: (id) => ipcRenderer.invoke('app:deleteSnapshot', id),
  runAnalysis: (snapshotId, compareId) => ipcRenderer.invoke('app:runAnalysis', snapshotId, compareId),
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
  testLlm: () => ipcRenderer.invoke('app:testLlm'),
  runDiagnosis: (snapshotId, compareId) => ipcRenderer.invoke('app:runDiagnosis', snapshotId, compareId),
  askDiagnosis: (snapshotId, question) => ipcRenderer.invoke('app:askDiagnosis', snapshotId, question),
  onLlmChunk: (cb) => {
    const listener = (_e: unknown, text: string): void => cb(text)
    ipcRenderer.on('llm:chunk', listener)
    return () => ipcRenderer.removeListener('llm:chunk', listener)
  },
  buildReport: (snapshotId, compareId) => ipcRenderer.invoke('app:buildReport', snapshotId, compareId),
  exportReport: (snapshotId, compareId) => ipcRenderer.invoke('app:exportReport', snapshotId, compareId)
}

contextBridge.exposeInMainWorld('api', api)
