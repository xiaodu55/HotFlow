/**
 * 表格单元格值的宽松解析。平台导出表格里数字常带千分位、单位后缀
 * （「1.2万」「45.6%」「00:01:23」「2分13秒」），这里统一转成标准值。
 */

const EMPTY_TOKENS = new Set(['', '-', '--', '—', '/', '无', 'null', 'nan', '#n/a'])

function cleanStr(v: unknown): string {
  return String(v ?? '')
    .replace(/[\u200b\ufeff]/g, '')
    .trim()
}

/** 数量类：支持「1,234」「1.2万」「3亿」「456w」 */
export function parseCount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = cleanStr(v)
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null
  const noComma = s.replace(/,/g, '')
  const m = noComma.match(/^(-?\d+(?:\.\d+)?)\s*(万|亿|w|k)?$/i)
  if (!m) return null
  let n = parseFloat(m[1])
  const unit = m[2]?.toLowerCase()
  if (unit === '万' || unit === 'w') n *= 1e4
  else if (unit === '亿') n *= 1e8
  else if (unit === 'k') n *= 1e3
  return Math.round(n * 100) / 100
}

/** 百分比：返回 0-100 的百分数。「0.45」「45%」「45.6%」都归一成 45 */
export function parsePercent(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    return v <= 1 ? Math.round(v * 10000) / 100 : Math.round(v * 100) / 100
  }
  const s = cleanStr(v)
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null
  const hasPercent = s.includes('%')
  const num = parseFloat(s.replace(/[%\s]/g, ''))
  if (!Number.isFinite(num)) return null
  const value = !hasPercent && num <= 1 ? num * 100 : num
  return Math.round(value * 100) / 100
}

/** 时长：支持秒数、「00:01:23」「01:23」「2分13秒」「90秒」「1.5分钟」 */
export function parseDurationSec(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = cleanStr(v)
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null

  const clock = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (clock) {
    const h = clock[1] ? parseInt(clock[1], 10) : 0
    return h * 3600 + parseInt(clock[2], 10) * 60 + parseFloat(clock[3])
  }

  const cn = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:小时|时|h|hr))?(?:(\d+(?:\.\d+)?)\s*(?:分|分钟|m|min))?(?:(\d+(?:\.\d+)?)\s*(?:秒|s|sec)?)?$/i)
  if (cn && (cn[1] || cn[2] || cn[3])) {
    return (
      (cn[1] ? parseFloat(cn[1]) * 3600 : 0) +
      (cn[2] ? parseFloat(cn[2]) * 60 : 0) +
      (cn[3] ? parseFloat(cn[3]) : 0)
    )
  }

  const num = parseFloat(s)
  return Number.isFinite(num) ? num : null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 时间：兼容 Date 对象、excel 序列号、'2026/8/1 20:30'、'2026-08-01'、'2026年8月1日 20:30' */
export function parseDateTime(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return formatDate(v)
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel 日期序列号（以 1900-01-01 为基准）
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : formatDate(d)
  }
  const s = cleanStr(v)
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null
  const normalized = s
    .replace(/年|月|\./g, '-')
    .replace(/日/g, ' ')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  // 直接按字段解析，避免 date-only 字符串被 new Date 当作 UTC 造成时区偏移
  const m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?)?$/)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m
    const secPart = sec.includes('.') ? String(Math.floor(parseFloat(sec))) : String(parseInt(sec, 10))
    return `${y}-${pad(parseInt(mo, 10))}-${pad(parseInt(d, 10))} ${pad(parseInt(h, 10))}:${pad(parseInt(mi, 10))}:${pad(parseInt(secPart, 10))}`
  }
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : formatDate(d)
}

/** 归一化列名：去首尾空白、合并连续空白，用于列匹配 */
export function normalizeHeader(h: unknown): string {
  return cleanStr(h).replace(/\s+/g, ' ')
}
