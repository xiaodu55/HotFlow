/**
 * 生成应用图标 build/icon.png（512×512，HotFlow 青紫渐变圆角底 + 白色流量波纹）。
 * 纯 Node 实现（zlib + 手写 PNG 编码），无额外依赖。运行：npm run icon
 */
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SIZE = 512
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 图形 ----------
// 圆角矩形 SDF：<0 在内部
function roundRectSdf(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r)
  const qy = Math.abs(py - cy) - (halfH - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const rgba = Buffer.alloc(SIZE * SIZE * 4)
const c1 = hexRgb('#22d3ee')
const c2 = hexRgb('#6366f1')
const corner = SIZE * 0.22

// 三条「流量波纹」横条：x 起点、终点、y 中心、半高（均为相对 0~1）
const bars = [
  { x0: 0.2, x1: 0.8, yc: 0.36, hh: 0.042 },
  { x0: 0.2, x1: 0.6, yc: 0.52, hh: 0.042 },
  { x0: 0.2, x1: 0.7, yc: 0.68, hh: 0.042 }
]

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4
    const d = roundRectSdf(x + 0.5, y + 0.5, SIZE / 2, SIZE / 2, SIZE / 2 - 2, SIZE / 2 - 2, corner)
    if (d > 0) continue // 圆角外透明

    // 对角渐变底
    const t = (x + y) / (2 * SIZE)
    let r = c1[0] + (c2[0] - c1[0]) * t
    let g = c1[1] + (c2[1] - c1[1]) * t
    let b = c1[2] + (c2[2] - c1[2]) * t

    // 白色波纹条（圆角端点）
    for (const bar of bars) {
      const dd = roundRectSdf(
        x + 0.5,
        y + 0.5,
        ((bar.x0 + bar.x1) / 2) * SIZE,
        bar.yc * SIZE,
        ((bar.x1 - bar.x0) / 2) * SIZE,
        bar.hh * SIZE,
        bar.hh * SIZE
      )
      if (dd < 0) {
        const k = Math.min(1, -dd / 1.5) // 边缘 1.5px 抗锯齿
        r = r * (1 - k) + 255 * k
        g = g * (1 - k) + 255 * k
        b = b * (1 - k) + 255 * k
      }
    }

    rgba[idx] = Math.round(r)
    rgba[idx + 1] = Math.round(g)
    rgba[idx + 2] = Math.round(b)
    rgba[idx + 3] = 255
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, encodePng(SIZE, SIZE, rgba))
console.log(`已生成 ${OUT}（${SIZE}x${SIZE}）`)
