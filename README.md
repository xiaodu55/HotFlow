# HotFlow — 视频运营分析 Agent

> HotFlow（热流）：视频运营的本质就是抓住热流量。

一个 Electron 桌面应用：把平台创作者后台**手动导出的数据表格**（Excel / CSV）导入，
自动完成**指标分析、趋势可视化、环比对比、AI 内容诊断与发布策略建议**，
并支持导出**单文件离线 HTML 报告**。

## 功能

- **导入数据**：支持 xlsx / xls / csv；列名自动识别（内置抖音适配 + 通用关键词匹配），「1.2万」「45.6%」「00:01:23」「2分13秒」等格式自动归一化
- **数据看板**：总播放 / 互动率 / 完播率 / 涨粉等 KPI，导入第二份数据后自动与上期环比（↑↓%）；
  发布趋势（按日/周/月自动分桶）、发布时段 × 表现、视频时长 × 表现三张图表；播放 Top5 / Bottom5
- **视频明细**：全指标表格，可排序、搜索，Top/Bottom 行高亮
- **AI 诊断**：接入任意 OpenAI 兼容大模型（DeepSeek / 智谱 GLM / 通义千问 / 自定义），流式输出
  爆款共性、低效归因、标题封面诊断、发布时间与选题建议、行动清单；未配置 API Key 时其余功能不受影响
- **分析报告**：应用内实时预览 + 一键导出单文件 HTML（内联 ECharts，双击离线可开，含 AI 诊断结论）

数据只保存在本机（快照与配置存于系统用户数据目录），不上传任何服务器。

## 快速开始

```bash
npm install        # 安装依赖（Electron 下载失败时见下方「常见问题」）
npm run sample     # 生成两份样例数据（samples/ 下，可选）
npm run dev        # 启动应用
```

使用流程：**导入数据** → 选择平台 → 选择平台后台导出的表格 → 自动跳转看板；
过一段时间再导出新表格导入，即可看到环比。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式启动 |
| `npm run build` | 构建主进程 / preload / 渲染层到 `out/` |
| `npm run dist` | 打包 Windows 安装包到 `dist/`（产物：`HotFlow 视频运营分析.exe`） |
| `npm test` | 运行单元测试（vitest，28 个用例） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run sample` | 重新生成样例数据 |

## 平台适配

每份导入数据对应一个「平台」配置，决定导出表格的列如何映射到标准字段
（标题、发布时间、时长、播放、点赞、评论、分享、收藏、涨粉、完播率、平均播放时长）。

- **抖音**：适配创作者中心导出的常见列名
- **通用（自动识别列名）**：按关键词双向包含匹配，适合大多数平台

新平台只需在 `src/shared/platforms.ts` 的 `PLATFORMS` 中加一份列名候选配置，无需改其他代码。
匹配不上的列会保留原始列名并在导入时提示，不会丢失数据。

## 大模型配置

在应用「设置」页选择服务商（或自定义 OpenAI 兼容接口），填入 baseURL / API Key / 模型名，
保存后即可在「AI 诊断」页生成诊断。API Key 保存在本机 settings.json，可通过「测试连接」验证。

## 目录结构

```
src/
├── shared/          # 前后端共享：类型、平台列映射、宽松解析、指标计算（可单测）
├── main/            # Electron 主进程
│   ├── ingest.ts    #   Excel/CSV 读取
│   ├── history.ts   #   导入快照存储（userData/history/*.json）
│   ├── metrics.ts   #   （指标计算在 shared/metrics.ts）
│   ├── llm.ts       #   OpenAI 兼容客户端 + 诊断 JSON 解析
│   ├── report.ts    #   单文件 HTML 报告生成（内联 echarts.min.js）
│   ├── ipc.ts       #   IPC handlers
│   └── settings.ts  #   本机设置
├── preload/         # contextBridge 暴露 window.api（类型安全）
└── renderer/src/    # React + AntD 界面（导入 / 看板 / 明细 / AI诊断 / 报告 / 设置）
samples/             # 样例数据（npm run sample 生成）
tests/               # vitest 单元测试 + 样例端到端测试
```

## 常见问题

**Electron 二进制下载失败**（国内网络）：项目 `.npmrc` 已配置 npmmirror 镜像；
若仍失败，可换 `ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/ node node_modules/electron/install.js` 手动补下载。

**导入的表格列没被识别**：换「通用（自动识别列名）」平台试试；仍不行则在
`src/shared/platforms.ts` 给对应字段加列名候选（支持模糊包含匹配）。
