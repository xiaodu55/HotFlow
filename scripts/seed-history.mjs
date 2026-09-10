/**
 * 开发辅助：把两期样例数据直接生成为标准快照写入 userData/history，
 * 用于快速验证报告/涨跌榜/净增趋势（跳过 UI 导入流程）。运行：npm run seed
 */
import ExcelJS from 'exceljs'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const historyDir = join(process.env.APPDATA, 'hotflow', 'history')
mkdirSync(historyDir, { recursive: true })

const n = (v) => {
  const s = String(v ?? '').trim()
  if (!s || s === '-') return 0
  const m = s.match(/^([\d,.]+)\s*(万|亿|w)?$/i)
  if (!m) return 0
  let x = parseFloat(m[1].replace(/,/g, ''))
  const u = m[2]?.toLowerCase()
  if (u === '万' || u === 'w') x *= 1e4
  else if (u === '亿') x *= 1e8
  return Math.round(x)
}
const dur = (v) => {
  const s = String(v ?? '')
  const c = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/)
  if (c) return (c[1] ? +c[1] * 3600 : 0) + +c[2] * 60 + +c[3]
  const cn = s.match(/(?:(\d+)分)?(\d+)秒/)
  if (cn) return (cn[1] ? +cn[1] * 60 : 0) + +cn[2]
  const x = parseFloat(s)
  return Number.isFinite(x) ? x : null
}
const pct = (v) => {
  const s = String(v ?? '').replace('%', '')
  const x = parseFloat(s)
  return Number.isFinite(x) ? x : null
}

async function readRows(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  const headers = []
  ws.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.value ?? '').trim()))
  const rows = []
  for (let i = 2; i <= ws.rowCount; i++) {
    const values = ws.getRow(i).values ?? []
    const row = {}
    for (let col = 1; col < headers.length; col++) if (headers[col]) row[headers[col]] = values[col]
    if (Object.values(row).some((v) => v != null && v !== '')) rows.push(row)
  }
  return rows
}

async function makeSnapshot(id, file, importedAt, account, note) {
  const rows = await readRows(file)
  const records = rows.map((r, i) => ({
    id: `v${i}`,
    title: String(r['作品名称'] ?? r['视频标题'] ?? '(无标题)'),
    publishTime: String(r['发布时间'] ?? ''),
    durationSec: dur(r['时长'] ?? r['视频时长(秒)']),
    plays: n(r['播放量'] ?? r['播放次数']),
    likes: n(r['点赞量'] ?? r['点赞数']),
    comments: n(r['评论量'] ?? r['评论数']),
    shares: n(r['分享量'] ?? r['转发数']),
    collects: n(r['收藏量']),
    followsGained: r['涨粉数'] != null ? n(r['涨粉数']) : null,
    completionRate: pct(r['完播率'] ?? r['完播率(%)']),
    avgWatchSec: dur(r['平均播放时长'] ?? r['平均播放时长(秒)'])
  }))
  return {
    id,
    platform: 'douyin',
    platformLabel: '抖音',
    account,
    note,
    fileName: file.split(/[\\/]/).pop(),
    importedAt,
    recordCount: records.length,
    warnings: [],
    unmappedColumns: [],
    records
  }
}

const p1 = await makeSnapshot(
  'douyin-seed-1',
  join(root, 'samples', 'sample_douyin_period1.xlsx'),
  '2026-09-09T14:24:00.000Z',
  '校园好物号',
  '7月数据'
)
const p2 = await makeSnapshot(
  'douyin-seed-2',
  join(root, 'samples', 'sample_douyin_period2.xlsx'),
  '2026-09-09T14:28:00.000Z',
  '校园好物号',
  '8月数据'
)

writeFileSync(join(historyDir, `${p1.id}.json`), JSON.stringify(p1))
writeFileSync(join(historyDir, `${p2.id}.json`), JSON.stringify(p2))
console.log(`已写入 2 份快照（${p1.recordCount} + ${p2.recordCount} 条）到 ${historyDir}`)
