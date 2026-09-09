import { Tag } from 'antd'
import type { Delta } from '@shared/types'

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? '—' : Math.round(n).toLocaleString('zh-CN')

export const fmtPct = (n: number | null | undefined): string =>
  n == null ? '—' : `${n.toFixed(1)}%`

export const fmtTime = (iso: string | null | undefined): string =>
  iso ? iso.replace('T', ' ').slice(0, 16) : '—'

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  if (sec < 60) return `${Math.round(sec)}秒`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s ? `${m}分${s}秒` : `${m}分`
}

/** 环比变化标签：↑ 绿 / ↓ 红，无百分比基线时展示绝对差值 */
export function DeltaTag({ delta, unit }: { delta?: Delta; unit?: string }) {
  if (!delta || delta.direction === 'flat') {
    return (
      <span style={{ color: '#999', fontSize: 12 }}>—</span>
    )
  }
  const up = delta.direction === 'up'
  const text =
    delta.percent == null
      ? `${up ? '↑' : '↓'} ${fmtNum(Math.abs(delta.value))}${unit ?? ''}`
      : `${up ? '↑' : '↓'} ${Math.abs(delta.percent).toFixed(1)}%`
  return (
    <Tag color={up ? 'green' : 'red'} style={{ marginInlineEnd: 0 }} bordered={false}>
      {text}
    </Tag>
  )
}
