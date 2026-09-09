import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/api'

const api: Api = {
  pickAndImport: (platformId) => ipcRenderer.invoke('app:pickAndImport', platformId),
  listSnapshots: () => ipcRenderer.invoke('app:listSnapshots'),
  getSnapshot: (id) => ipcRenderer.invoke('app:getSnapshot', id),
  deleteSnapshot: (id) => ipcRenderer.invoke('app:deleteSnapshot', id),
  runAnalysis: (snapshotId, compareId) => ipcRenderer.invoke('app:runAnalysis', snapshotId, compareId),
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
  testLlm: () => ipcRenderer.invoke('app:testLlm'),
  runDiagnosis: (snapshotId) => ipcRenderer.invoke('app:runDiagnosis', snapshotId),
  onLlmChunk: (cb) => {
    const listener = (_e: unknown, text: string): void => cb(text)
    ipcRenderer.on('llm:chunk', listener)
    return () => ipcRenderer.removeListener('llm:chunk', listener)
  },
  buildReport: (snapshotId) => ipcRenderer.invoke('app:buildReport', snapshotId),
  exportReport: (snapshotId) => ipcRenderer.invoke('app:exportReport', snapshotId)
}

contextBridge.exposeInMainWorld('api', api)
