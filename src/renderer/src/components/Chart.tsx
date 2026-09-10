import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import echarts, { type ChartInstance } from '../echarts'
import { ensureEchartsThemes, useTheme } from '../theme'

interface Props {
  option: EChartsOption
  height?: number
}

export default function Chart({ option, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const { mode } = useTheme()
  const themeName = mode === 'dark' ? 'hotflow-dark' : 'hotflow-light'

  useEffect(() => {
    ensureEchartsThemes()
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, themeName)
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [themeName])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={containerRef} style={{ height, width: '100%' }} />
}
