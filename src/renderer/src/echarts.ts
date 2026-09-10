/**
 * echarts 按需引入：项目仅用折线/柱状两类图表 + 网格/提示/图例组件。
 * 统一从这里取用，不要直接 import 'echarts'——全量包会把整个 zrender 打进渲染 bundle。
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export default echarts

/** 图表实例类型（echarts/core 的 init 返回值） */
export type ChartInstance = ReturnType<typeof echarts.init>
