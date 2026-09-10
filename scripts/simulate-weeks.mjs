/**
 * 模拟 4 期周更运营数据（真实使用节奏）：
 * - 第 1 周：20 条视频自然发布（时间随机）
 * - 第 2 周起：按上期建议改为「晚 19-22 点发布」，新视频的周增量放大（策略见效）
 * - 每期 70% 视频从上期沿用（同名同发布日，累计值增长）+ 若干新视频
 * 写入 userData/history，可直接在应用里查看 4 期环比与净增趋势。运行：npm run simulate
 */
import ExcelJS from 'exceljs'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const historyDir = join(process.env.APPDATA, 'hotflow', 'history')
mkdirSync(historyDir, { recursive: true })

let seed = 20260910
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const randInt = (min, max) => Math.floor(min + rand() * (max - min + 1))
const pick = (arr) => arr[randInt(0, arr.length - 1)]
const pad = (n) => String(n).padStart(2, '0')

const TOPICS = ['宿舍开箱', '食堂测评', '图书馆占座', '校园夜跑', '考研日常', '社团招新', '操场日落', '早八日常', '军训回忆', '网吧五连坐', '宿舍做饭', '校园美食']
const SUFFIX = ['', '', '', '｜vlog', '（上集）', '（下集）', '#校园生活', '！']

let videoSeq = 0

function newVideo(publishDate, lateNight) {
  // lateNight=true：模拟「按建议改晚 8 点发布」，同时基础播放上浮
  const hour = lateNight ? randInt(19, 22) : randInt(7, 23)
  const minute = pick([0, 5, 10, 15, 30, 45])
  const base = randInt(2500, 14000) * (lateNight ? 1.25 : 1)
  const viral = rand() < 0.1 ? randInt(4, 10) : 1
  const plays = Math.round(base * viral)
  return {
    seq: ++videoSeq,
    title: `${pick(TOPICS)}${pick(SUFFIX)}`,
    publishDate,
    hour,
    minute,
    durationSec: randInt(20, 210),
    plays,
    likes: Math.round(plays * (0.03 + rand() * 0.04)),
    comments: Math.round(plays * (0.004 + rand() * 0.008)),
    shares: Math.round(plays * (0.003 + rand() * 0.006)),
    collects: Math.round(plays * (0.005 + rand() * 0.01)),
    follows: Math.round(plays * (0.001 + rand() * 0.002)),
    completionRate: Math.max(8, Math.min(92, randInt(20, 65))),
    avgWatchSec: 0
  }
}

function rollForward(prev, growthBoost) {
  return {
    ...prev,
    plays: Math.round(prev.plays * (1 + (0.06 + rand() * 0.12) * growthBoost)),
    likes: Math.round(prev.likes * (1 + (0.05 + rand() * 0.1) * growthBoost)),
    comments: Math.round(prev.comments * (1 + (0.04 + rand() * 0.1) * growthBoost)),
    shares: Math.round(prev.shares * (1 + (0.04 + rand() * 0.1) * growthBoost)),
    collects: Math.round(prev.collects * (1 + (0.05 + rand() * 0.12) * growthBoost)),
    follows: prev.follows + Math.round(prev.plays * (0.0008 + rand() * 0.0015) * growthBoost)
  }
}

function finalize(list) {
  return list.map((v) => {
    const er = v.plays ? (v.likes + v.comments + v.shares + v.collects) / v.plays : 0
    return { ...v, avgWatchSec: Math.round(v.durationSec * (v.completionRate / 100) * (0.8 + rand() * 0.4)), er }
  })
}

// 第 1 周（导入 08-17）：8/3~8/16 发布，20 条
const dates = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']
const weekRanges = [
  ['2026-08-03', '2026-08-16'],
  ['2026-08-17', '2026-08-23'],
  ['2026-08-24', '2026-08-30'],
  ['2026-08-31', '2026-09-06']
]

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

let list = []
for (let i = 0; i < 20; i++) {
  const day = addDays(weekRanges[0][0], randInt(0, 13))
  list.push(newVideo(day, false))
}
const weeks = [finalize(list)]

// 第 2 周起：沿用 + 新视频（晚 8 点策略，策略系数逐周放大）
for (let w = 1; w < 4; w++) {
  const boost = 1 + w * 0.35 // 策略见效：越往后增长越明显
  const carried = weeks[w - 1].slice(0, Math.ceil(weeks[w - 1].length * 0.7)).map((v) => rollForward(v, boost))
  const fresh = []
  for (let i = 0; i < randInt(3, 5); i++) {
    const day = addDays(weekRanges[w][0], randInt(0, 6))
    fresh.push(newVideo(day, true))
  }
  list = [...carried, ...fresh].map((v) => ({ ...v, er: v.plays ? (v.likes + v.comments + v.shares + v.collects) / v.plays : 0 }))
  weeks.push(finalize(list))
}

// 写 xlsx（抖音导出格式）并生成快照
async function toSnapshot(weekIdx) {
  const rows = weeks[weekIdx]
  const importedAt = `${dates[weekIdx]}T10:${pad(10 + weekIdx)}:00.000Z`
  const id = `douyin-sim-${weekIdx + 1}-${Date.now()}`
  const note = `第${['一', '二', '三', '四'][weekIdx]}周`

  const records = rows.map((r, i) => ({
    id: `v${i}`,
    title: r.title,
    publishTime: `${r.publishDate} ${pad(r.hour)}:${pad(r.minute)}:00`,
    durationSec: r.durationSec,
    plays: r.plays,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    collects: r.collects,
    followsGained: r.follows,
    completionRate: r.completionRate,
    avgWatchSec: r.avgWatchSec
  }))

  // 顺手写一份 xlsx 到 samples/sim，方便人工核对
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('作品数据')
  ws.addRow(['作品名称', '发布时间', '时长', '播放量', '点赞量', '评论量', '分享量', '收藏量', '涨粉数', '完播率', '平均播放时长'])
  for (const r of records) {
    ws.addRow([
      r.title,
      r.publishTime,
      `00:${pad(Math.floor(r.durationSec / 60))}:${pad(r.durationSec % 60)}`,
      r.plays, r.likes, r.comments, r.shares, r.collects, r.followsGained ?? 0,
      `${r.completionRate}%`,
      `${Math.floor(r.avgWatchSec / 60)}分${r.avgWatchSec % 60}秒`
    ])
  }
  const simDir = join(root, 'samples', 'sim')
  mkdirSync(simDir, { recursive: true })
  await wb.xlsx.writeFile(join(simDir, `第${note.slice(1, 3)}周.xlsx`))

  return { id, importedAt, note, records }
}

for (let w = 0; w < 4; w++) {
  const snap = await toSnapshot(w)
  writeFileSync(join(historyDir, `${snap.id}.json`), JSON.stringify({
    id: snap.id,
    platform: 'douyin',
    platformLabel: '抖音',
    account: '示例账号',
    note: snap.note,
    fileName: `模拟数据_${snap.note}.xlsx`,
    importedAt: snap.importedAt,
    recordCount: snap.records.length,
    warnings: [],
    unmappedColumns: [],
    records: snap.records
  }))
  console.log(`第${w + 1} 周：${snap.records.length} 条（导入于 ${dates[w]}）`)
}
console.log('4 期周更模拟数据已写入 history')
