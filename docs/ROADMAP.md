# HotFlow 项目开发规划

> **范围说明**：本规划只覆盖**已有功能的完善与打磨**——修 bug、数据正确性、性能、体验，不含新功能扩展（B站/小红书等新平台接入、批量导入）与工程化建设（GitHub CI、lint、自动更新），需要时另行规划。
>
> 依据：2026-09-10 全量代码调研 + 实测（55 个 vitest 用例、typecheck 均通过）。

## 一、项目现状

**HotFlow（热流）**：Electron 桌面应用。把平台创作者后台**手动导出**的数据表格（Excel/CSV）导入本机，自动完成指标分析、趋势可视化、环比对比、AI 内容诊断与发布策略建议，导出单文件离线 HTML 报告。纯本地运行，无服务器。

- **技术栈**：TypeScript + Electron 44（electron-vite 三段式）+ React 18 + AntD 6 + ECharts 6；exceljs/papaparse 数据摄取；openai SDK（OpenAI 兼容协议，DeepSeek/智谱/通义/自定义预设）
- **规模**：37 个源文件、约 6,400 行；其中 `src/shared/` 纯函数层约 1,300 行
- **质量基线**：vitest 55 个用例全部通过，`npm run typecheck` 通过，无 TODO/FIXME 遗留
- **架构优势**：类型契约完备（`shared/types.ts` + `shared/api.ts`）；指标计算全部在可单测的 `shared/metrics.ts`；平台列映射是注册表（`shared/platforms.ts`）；数据层为纯 JSON 文件（`%APPDATA%/hotflow/history/`）

### 已有功能清单

| 模块 | 能力 | 主要代码 |
| --- | --- | --- |
| 数据导入 | 拖拽/选文件、列映射预检、脏数据警告、账号+周期备注、空行跳过、示例数据一键体验 | `renderer/src/pages/Import.tsx`、`main/ingest.ts`、`shared/normalize.ts` |
| 数据看板 | KPI 环比、净增口径、内容水位分级、趋势分桶（日/周/月）、时段×表现、时长×表现、Top/Bottom5、涨跌榜、净增趋势图、CSV 导出 | `renderer/src/pages/Dashboard.tsx`、`shared/metrics.ts` |
| 视频明细 | 排序/搜索/密度切换、Top/Bottom 高亮 | `renderer/src/pages/Videos.tsx` |
| AI 诊断 | 流式输出、结构化 JSON 容错解析、上期建议复盘（retrospective）、追问对话、诊断归档（每快照上限 10 份） | `main/llm.ts`、`main/history.ts`（archiveDiagnosis）、`renderer/src/pages/Diagnosis.tsx` |
| 分析报告 | 应用内预览 + 导出单文件离线 HTML（内联 ECharts，含 AI 诊断与追问记录） | `main/report.ts`、`renderer/src/pages/Report.tsx` |
| 备份/设置 | 全量快照+设置导出/恢复；LLM 预设、测试连接不落盘、明暗主题 | `main/backup.ts`、`main/settings.ts` |

## 二、任务规划（按模块）

每项任务粒度以"单 commit 可完成"为准，含问题、改动点与验收标准。

### 分析报告

**任务 1（P0）修复"两期对比明细"环比恒为「—」**

- 现象：导入两期数据后导出报告，对比表的方向列恒为「→」、幅度列恒为「—」（已在 `output/` 真实导出产物中验证）。
- 根因：`src/main/report.ts:109` 的 `deltaTableHtml` 用中文指标名（如 `'总播放'`）查 `deltas`，而 `computeDeltas`（`src/shared/metrics.ts:122-141`）返回英文键（`'plays'`、`'likes'` 等），查找永远 miss。
- 改动点：`deltaTableHtml` 的 rows 数组从 `[label, cur, prev, fmt]` 改为携带 delta 键（如 `[key, label, cur, prev, fmt]`），用 `deltas[key]` 取值。
- 验收：导出报告的环比列正确显示 ↑/↓ 与百分比；`deltaTableHtml` 有 vitest 单测覆盖（report.ts 目前零测试）。

**任务 2（P1）周趋势桶 end 字段修正**

- 问题：`computeTrend` 周桶的 `end` 恒等于 `start`（`src/shared/metrics.ts` 约 196-199 行），趋势区间展示与导出不准确。
- 验收：单测断言周桶 `end` = `start` + 6 天。

**任务 3（P1）报告图表纯离线可用性**

- 问题：报告优先内联本地 `echarts.min.js`，失败时退回 CDN（`src/main/report.ts:6-14`）；若内联与网络都不可用，图表区域空白且无提示。
- 方案：内联失败时明确降级——在报告图表位置渲染占位提示文案；评估将 `echarts.min.js` 随安装包分发（`extraResources` 已有先例，需权衡 ~1MB 体积）。
- 验收：断网环境导出并双击打开报告，要么图表正常，要么有清晰占位提示（不出现无解释的空白区域）。

### 数据看板与计算

**任务 4（P1）跨期视频匹配防误配**

- 问题：跨期视频匹配键是"标题+发布日"（`src/shared/metrics.ts` 约 279-281 行）；无发布时间的记录退化为纯标题匹配，同名视频可能误配。
- 方案：无发布时间的记录改用"标题+时长"复合键；标题先做归一化（去首尾空格、统一全半角）再比较。
- 验收：单测覆盖「同名视频、不同时长」「同标题不同期」两个场景，不再误配。

**任务 5（P1）分析链路性能**

- 问题：切换快照/对比期时 `runAnalysis` 全量重算（`renderer/src/App.tsx:106-130` 每次重新请求）；净增趋势 `loadAccountChain`（`src/main/ipc.ts:33-41`）把同账号全部快照**完整读入内存**。
- 方案：主进程按 `snapshotId+compareId` 缓存 `AnalysisResult`，快照增删改/恢复备份时失效；`loadAccountChain` 尽量只读所需字段或复用任务 7 的 meta 索引。
- 验收：4 期以上数据下切换快照明显变快，行为与数值不变（纯性能优化）。

**任务 7（P2）快照列表 meta 索引**

- 问题：`listSnapshots`（`src/main/history.ts:19-35`）每次全量读取并 `JSON.parse` 所有快照文件只为取 meta；`findPreviousSnapshot`、`loadAccountChain`、备份（`backup.ts:14-21`）都间接调用它。
- 方案：`saveSnapshot` 时同步写 `<id>.meta.json`；`listSnapshots` 只读 meta 文件，旧快照无 meta 时回退现有全量解析（兼容）；`deleteSnapshot` 同步删除 meta 文件。meta 是派生数据，备份文件格式不变，恢复时经 `saveSnapshot` 自动补写。
- 验收：快照数量较多时列表、环比基线查找、备份导出耗时明显下降；旧数据目录升级后行为不变。

### 视频明细

**任务 8（P2）明细表分页**

- 问题：`Videos.tsx` 一次性渲染全表，数据量大时卡顿。
- 方案：AntD Table 自带 pagination（默认每页 50、可选 20/50/100），保持现有排序/搜索/高亮行为。
- 验收：大表下滚动、排序、搜索不卡；现有交互无回归。

### AI 诊断与策略闭环（已有能力的深化）

**任务 9（P2）诊断注入"建议执行对照"**

- 现状：retrospective 机制已把上期诊断建议喂给模型（`src/main/llm.ts:24-26`），但只给文本建议、没有本期执行数据，模型只能猜"是否执行"。
- 方案：诊断 prompt 附上"上期建议清单 + 本期对应数据对照"（如建议 19-22 点发布 → 附本期该时段实际发布占比与表现）。
- 验收：有上期诊断时，输出中的 retrospective 能明确区分"已执行且有效 / 已执行但无效 / 未执行"。

**任务 10（P2，可选）看板"策略复盘"卡片**

- 方案：看板新增一张"上期建议 → 本期验证"卡片，数据来自诊断归档（`src/main/history.ts` archiveDiagnosis）+ 本期指标，状态为 ✓ 已验证 / ✗ 未见效 / 待验证。
- 验收：存在上期诊断且已导入第二期数据时卡片可见；无历史诊断时不占位。

### 备份、设置与文档

**任务 6（P1）README 与实际对齐**

- 问题：README.md 第 39 行写"28 个用例"，实际已 55；涨跌榜、净增趋势图、内容水位分级、数据备份/恢复、示例数据一键体验、策略闭环复盘等近期功能均未写入功能清单。
- 方案：测试数量不再硬编码（或统一口径）；功能清单与常用命令表补全。
- 验收：README 描述与当前版本功能一一对应。

**任务 11（P2，可选）API Key 加密存储**

- 问题：API Key 以明文存于 `userData/settings.json`（`src/main/settings.ts`），桌面应用惯例但可加固。
- 方案：Electron `safeStorage` 加密后落盘，不可用时回退明文（Windows 下 DPAPI 基本可用）。
- 验收：settings.json 中不再出现明文 Key；测试连接、诊断功能正常。

**任务 12（P2）静默 catch 增加日志**

- 问题：主进程约 8 处 `catch {}` 静默吞错（多为合理兜底，如单个损坏文件不影响整体），但排查问题时无迹可循。
- 方案：轻量 logger 写 `userData/logs/main.log`（保留最近 7 天），各 catch 处记录；不引入重型日志库。
- 验收：人为放入损坏的快照文件，日志有记录，且快照列表/备份仍正常工作。

## 三、优先级总览与推进节奏

| 优先级 | 任务 | 模块 |
| --- | --- | --- |
| P0 | 1 修复报告环比「—」 | 报告 |
| P1 | 2 周桶 end、3 离线图表、4 匹配防误配、5 分析性能、6 README 对齐 | 报告/看板/明细/文档 |
| P2 | 7 meta 索引、8 明细分页、9 建议执行对照、10 复盘卡片*、11 Key 加密*、12 catch 日志 | 全模块（*为可选） |

- 推进顺序：P0 → P1 → P2，做完一项验一项；P0/P1 完成即可发 **v0.1.1**，P2 完成发 **v0.2**。
- 每项任务对应一次 commit，提交信息沿用现有 conventional 风格（`fix:` / `feat:` / `docs:`）。
- 测试要求：凡涉及 `shared/` 纯函数的任务（2、4）必须带单测；`report.ts` 借任务 1 补上首批测试。

## 四、风险与依赖

- **任务 1-8 无外部依赖**，可立即开始；验证数据可用 `npm run sample` / `npm run simulate` 在本机生成。
- **任务 3** 受安装包体积约束（echarts.min.js 约 1MB），实施时先做占位提示，随包分发作为后续决定。
- **任务 4** 的天花板是平台限制：视频改名后任何本地策略都无法自动匹配，只能靠文案说明。
- **任务 11** 依赖系统 keyring，Linux 无 keyring 环境需回退（当前只打 Windows 包，影响小）。
- 产品定位保持不变：**纯本地、无服务器、手动导出数据驱动**；所有改动不得把数据或配置上传外部服务。

## 五、第三轮：执行闭环三件套（v0.3，2026-09-10）

运营视角评审确立的方向：把产品从「分析顾问」推进为「运营工作台」，补上"AI 建议 → 执行 → 验证"中间的落地断层。

1. **批量导入**：多文件拖拽/选择、逐文件成败结果——审计发现 UI 层已具备该能力，本轮仅移除了未被调用的 `pickAndImport` 死代码。
2. **视频自定义标签**：以 matchKey（标题+发布日）为键跨期跟随视频；明细页打标/筛选，看板新增「标签表现」聚合卡（`computeTagStats` 纯函数）。
3. **选题库**：新页面 + 菜单项；AI 诊断的选题/行动建议一键入库（同文本去重），支持手动记录与状态流转（待执行/已发布/已放弃）。
4. **AI 周报文案**：`shared/weekly.ts` 纯函数产出数据摘要与兜底模板；配置大模型时走 AI 生成 Markdown 周报，未配置/失败自动回退数据模板，报告页一键生成并复制。

明确不做（记录权衡）：粉丝画像/流量结构分析（平台导出数据源未确认）、发布日历与全平台总览（留待后续轮次）、团队协作/云同步（违背纯本地定位）。
