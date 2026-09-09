/**
 * 生成两份模拟「抖音创作者中心」导出格式的样例数据：
 *   samples/sample_douyin_period1.xlsx （7月，作为环比基期）
 *   samples/sample_douyin_period2.xlsx （8月，本期；列名略有差异，用于测试列映射鲁棒性）
 * 数据内置规律：晚间 19-22 点发布的视频播放量更高，另含少量爆款。
 * 运行：npm run sample
 */
import ExcelJS from 'exceljs'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'samples')

// 简单可复现的伪随机
let seed = 42
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
function randInt(min, max) {
  return Math.floor(min + rand() * (max - min + 1))
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

const TOPICS = ['宿舍开箱', '期末复习', '食堂测评', '校园夜跑', '考研日常', '图书馆占座', '操场日落', '社团招新', '军训回忆', '网吧五连坐', '早八日常', '宿舍做饭']
const SUFFIX = ['', '', '', '｜vlog', '（上集）', '（下集）', '#校园生活', '！']

function videoRow(day, hour, minute, viralBoost) {
  const title = `${pick(TOPICS)}${pick(SUFFIX)}`
  const durationSec = randInt(18, 240)
  const base = randInt(2000, 12000)
  const eveningBonus = hour >= 19 && hour <= 22 ? 2.2 : hour >= 12 && hour <= 14 ? 1.3 : 0.7
  const plays = Math.round(base * eveningBonus * viralBoost)
  const likeRate = 0.03 + rand() * 0.04
  const likes = Math.round(plays * likeRate)
  const comments = Math.round(plays * (0.004 + rand() * 0.008))
  const shares = Math.round(plays * (0.003 + rand() * 0.006))
  const collects = Math.round(plays * (0.005 + rand() * 0.01))
  const follows = Math.round(plays * (0.001 + rand() * 0.003))
  const completion = Math.max(5, Math.min(95, Math.round((60 - durationSec / 6) * (0.8 + rand() * 0.4))))
  const avgWatch = Math.round(durationSec * (completion / 100) * (0.8 + rand() * 0.4))
  return { title, day, hour, minute, durationSec, plays, likes, comments, shares, collects, follows, completion, avgWatch }
}

function buildRows(year, month, count) {
  const rows = []
  for (let i = 0; i < count; i++) {
    const day = randInt(1, 28)
    // 三成视频安排在晚间黄金档
    const hour = rand() < 0.3 ? randInt(19, 22) : randInt(7, 23)
    const minute = pick([0, 5, 10, 15, 30, 45])
    const viralBoost = rand() < 0.08 ? randInt(6, 15) : 1
    rows.push(videoRow(day, hour, minute, viralBoost))
  }
  return rows.sort((a, b) => a.day - b.day || a.hour - b.hour)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

async function writeSample(fileName, headers, rows, month) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('作品数据')
  ws.addRow(headers)
  for (const r of rows) {
    const publishTimeStr = `${new Date().getFullYear()}-${pad(month)}-${pad(r.day)} ${pad(r.hour)}:${pad(r.minute)}:00`
    const values = headers.map((h) => {
      switch (h) {
        case '作品名称':
        case '视频标题':
          return r.title
        case '发布时间':
          return publishTimeStr
        case '时长':
          return `00:${pad(Math.floor(r.durationSec / 60))}:${pad(r.durationSec % 60)}`
        case '视频时长(秒)':
          return r.durationSec
        case '播放量':
          return r.plays
        case '播放次数':
          return r.plays >= 10000 ? `${(r.plays / 10000).toFixed(1)}万` : String(r.plays)
        case '点赞量':
        case '点赞数':
          return r.likes
        case '评论量':
        case '评论数':
          return r.comments
        case '分享量':
        case '转发数':
          return r.shares
        case '收藏量':
          return r.collects
        case '涨粉数':
          return r.follows
        case '完播率':
          return `${r.completion}%`
        case '完播率(%)':
          return r.completion
        case '平均播放时长':
          return `${Math.floor(r.avgWatch / 60)}分${r.avgWatch % 60}秒`
        case '平均播放时长(秒)':
          return r.avgWatch
        default:
          return null
      }
    })
    ws.addRow(values)
  }
  // 加宽标题列
  ws.getColumn(1).width = 36
  ws.getColumn(2).width = 22
  await wb.xlsx.writeFile(join(outDir, fileName))
  console.log(`已生成 samples/${fileName}（${rows.length} 条）`)
}

mkdirSync(outDir, { recursive: true })

await writeSample(
  'sample_douyin_period1.xlsx',
  ['作品名称', '发布时间', '时长', '播放量', '点赞量', '评论量', '分享量', '收藏量', '涨粉数', '完播率', '平均播放时长'],
  buildRows(2026, 7, 24),
  7
)

await writeSample(
  'sample_douyin_period2.xlsx',
  ['视频标题', '发布时间', '视频时长(秒)', '播放次数', '点赞数', '评论数', '转发数', '收藏量', '涨粉数', '完播率(%)', '平均播放时长(秒)'],
  buildRows(2026, 8, 26),
  8
)
