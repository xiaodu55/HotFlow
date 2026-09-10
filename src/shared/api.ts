import type {
  AnalysisResult,
  AppSettings,
  DiagnosisResult,
  ImportOutcome,
  LlmConfig,
  Snapshot,
  SnapshotMeta,
  StrategyReview,
  TableInspect,
  Topic,
  TopicStatus,
  VideoTagMap
} from './types'

/** preload 暴露到 window.api 的类型安全接口，主进程按同名 channel 实现 */
export interface Api {
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
  /** 导出全部数据（快照 + 设置）为 JSON 备份文件 */
  exportBackup(): Promise<{ canceled: boolean; path?: string; snapshots?: number }>
  /** 选择备份文件并恢复（同名覆盖、新增追加） */
  importBackup(): Promise<{ canceled: boolean; snapshots?: number; settings?: boolean }>
  /** 加载内置示例数据（两期快照，账号「示例账号」），返回导入条数 */
  loadSampleData(): Promise<{ count: number }>
  /** 看板「策略复盘」卡片：上期建议与本期复盘结论（无上期诊断时 previous 为 null） */
  getStrategyReview(snapshotId: string): Promise<StrategyReview>
  /** 全部视频标签（键为 matchKeyOf，跨期稳定） */
  getVideoTags(): Promise<VideoTagMap>
  /** 设置一个视频键的标签（清空数组即删除该键），返回最新全量标签 */
  setVideoTags(key: string, tags: string[]): Promise<VideoTagMap>
  /** 选题库列表（新→旧） */
  listTopics(): Promise<Topic[]>
  /** 新增选题（同文本去重），返回最新列表 */
  addTopic(text: string, source?: 'ai' | 'manual'): Promise<Topic[]>
  /** 更新选题状态 */
  updateTopic(id: string, status: TopicStatus): Promise<Topic[]>
  /** 删除选题 */
  deleteTopic(id: string): Promise<Topic[]>
  /** 周报文案：配置了大模型走 AI 生成，否则/失败时回退纯数据模板（note 说明原因） */
  generateWeeklyReport(snapshotId: string): Promise<{ markdown: string; aiGenerated: boolean; note?: string }>
}
