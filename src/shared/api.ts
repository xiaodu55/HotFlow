import type {
  AnalysisResult,
  AppSettings,
  DiagnosisResult,
  ImportOutcome,
  Snapshot,
  SnapshotMeta
} from './types'

/** preload 暴露到 window.api 的类型安全接口，主进程按同名 channel 实现 */
export interface Api {
  /** 弹出文件选择框并导入，用户取消时返回 null */
  pickAndImport(platformId: string): Promise<ImportOutcome | null>
  listSnapshots(): Promise<SnapshotMeta[]>
  getSnapshot(id: string): Promise<{ snapshot: Snapshot; diagnosis: DiagnosisResult | null }>
  deleteSnapshot(id: string): Promise<void>
  /** compareId 不传时自动选同平台的上一次导入 */
  runAnalysis(snapshotId: string, compareId?: string): Promise<AnalysisResult>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  testLlm(): Promise<{ ok: boolean; message: string }>
  /** 流式生成诊断，增量文本经 onLlmChunk 推送；完成后自动保存并返回完整结果 */
  runDiagnosis(snapshotId: string): Promise<DiagnosisResult>
  onLlmChunk(cb: (text: string) => void): () => void
  buildReport(snapshotId: string): Promise<{ html: string }>
  exportReport(snapshotId: string): Promise<{ canceled: boolean; path?: string }>
}
