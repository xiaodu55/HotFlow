import type { ReactNode } from 'react'
import { METRIC_INFO, type MetricInfo } from '../metricsInfo'

/** 指标悬停内容：名称 / 公式 / 解读 三段结构化排版 */
export function MetricTip({ info }: { info: MetricInfo }): ReactNode {
  return (
    <div style={{ maxWidth: 280 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{info.name}</div>
      <div className="tip-formula">{info.formula}</div>
      {info.interpret ? <div className="tip-interpret">💡 {info.interpret}</div> : null}
    </div>
  )
}

/** 按字典 key 直接取说明 */
export function MetricTipByKey({ k }: { k: keyof typeof METRIC_INFO }): ReactNode {
  const info = METRIC_INFO[k]
  return info ? <MetricTip info={info} /> : null
}
