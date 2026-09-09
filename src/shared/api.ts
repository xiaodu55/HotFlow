import type {
  AnalysisResult,
  AppSettings,
  DiagnosisResult,
  ImportOutcome,
  LlmConfig,
  Snapshot,
  SnapshotMeta,
  TableInspect
} from './types'

/** preload 暴露到 window.api 的类型安全接口，主进程按同名 channel 实现 */
export interface Api {
  /** 弹出文件选择框并导入，用户取消时返回 null */
  pickAndImport(platformId: string): Promise<ImportOutcome | null>
  /** 只读解析表格，返回列映射预检结果（不落库） */
  inspectTable(filePath: string, platformId: string): Promise<TableInspect>
  /** 按路径导入（配合拖拽与预检确认），meta 携带账号名与周期备注 */
  importFile(filePath: string, platformId: string, meta?: { account?: string; note?: string }): Promise<ImportOutcome>
  /** Electron 渲染层的 File 对象 → 磁盘绝对路径（拖拽导入用） */
  getPathForFile(file: File): string
  listSnapshots(): Promise<SnapshotMeta[]>
  getSnapshot(id: string): Promise<{ snapshot: Snapshot; diagnosis: DiagnosisResult | null }>
  deleteSnapshot(id: string): Promise<void>
  /** compareId 不传时自动选同平台的上一次导入 */
  runAnalysis(snapshotId: string, compareId?: string): Promise<AnalysisResult>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  /** 用传入的配置测试连接（不落盘，避免覆盖已保存配置） */
  testLlm(cfg: LlmConfig): Promise<{ ok: boolean; message: string }>
  /** 流式生成诊断，增量文本经 onLlmChunk 推送；完成后自动保存并返回完整结果 */
  runDiagnosis(snapshotId: string, compareId?: string): Promise<DiagnosisResult>
  /** 基于已生成的诊断继续追问，返回追加对话后的完整诊断 */
  askDiagnosis(snapshotId: string, question: string): Promise<DiagnosisResult>
  onLlmChunk(cb: (text: string) => void): () => void
  buildReport(snapshotId: string, compareId?: string): Promise<{ html: string }>
  exportReport(snapshotId: string, compareId?: string): Promise<{ canceled: boolean; path?: string }>
}
