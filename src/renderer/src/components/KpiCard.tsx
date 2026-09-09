import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Tooltip } from 'antd'
import type { Delta } from '@shared/types'
import type { MetricInfo } from '../metricsInfo'
import { MetricTip } from './MetricTip'
import { useCountUp } from '../hooks/useCountUp'

/** KPI 卡片霓虹光斑配色（循环取用） */
const GLOWS = [
  'rgba(34, 211, 238, 0.35)',
  'rgba(129, 140, 248, 0.35)',
  'rgba(232, 121, 249, 0.32)',
  'rgba(52, 211, 153, 0.32)',
  'rgba(251, 191, 36, 0.30)',
  'rgba(56, 189, 248, 0.32)'
]

function DeltaTag({ delta, unit }: { delta?: Delta; unit?: string }) {
  if (!delta || delta.direction === 'flat') {
    return <span style={{ color: 'rgba(148,163,184,0.7)', fontSize: 12 }}>—</span>
  }
  const up = delta.direction === 'up'
  const text =
    delta.percent == null
      ? `${up ? '↑' : '↓'} ${Math.abs(delta.value).toLocaleString('zh-CN')}${unit ?? ''}`
      : `${up ? '↑' : '↓'} ${Math.abs(delta.percent).toFixed(1)}%`
  return (
    <span className={`delta-tag ${up ? 'delta-up' : 'delta-down'}`}>
      {text}
      {delta.percent != null ? '' : unit ?? ''}
    </span>
  )
}

interface Props {
  label: string
  /** 参与滚动动效的数值 */
  value: number
  format: (n: number) => string
  delta?: Delta
  suffix?: string
  /** 指标口径说明（悬停显示名称/公式/解读） */
  tipInfo?: MetricInfo
  /** 光斑配色索引，缺省按顺序循环 */
  glowIndex?: number
}

export default function KpiCard({ label, value, format, delta, suffix, tipInfo, glowIndex }: Props) {
  const animated = useCountUp(value)
  const glow = useMemo(() => GLOWS[(glowIndex ?? 0) % GLOWS.length], [glowIndex])

  const labelNode: ReactNode = tipInfo ? (
    <Tooltip title={<MetricTip info={tipInfo} />}>
      <span className="kpi-label-help">
        {label} <span className="kpi-q">?</span>
      </span>
    </Tooltip>
  ) : (
    label
  )

  return (
    <div className="kpi-card">
      <div className="kpi-glow" style={{ background: `radial-gradient(120px 80px at 88% 0%, ${glow}, transparent 70%)` }} />
      <div className="kpi-label">{labelNode}</div>
      <div className="kpi-value">
        <span className="grad-num">{format(animated)}</span>
        {suffix ? <span className="kpi-suffix">{suffix}</span> : null}
      </div>
      <div className="kpi-delta">
        {delta ? (
          <>
            <DeltaTag delta={delta} unit={suffix} />
            <Tooltip title="累计口径的环比变化；想看本期真实表现请看净增卡">
              <span className="kpi-vs">对比上期</span>
            </Tooltip>
          </>
        ) : null}
      </div>
    </div>
  )
}
