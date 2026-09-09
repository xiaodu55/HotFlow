import { createContext, useContext } from 'react'
import { theme as antdTheme } from 'antd'
import type { ThemeConfig } from 'antd'
import * as echarts from 'echarts'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'hotflow-theme'

export function loadThemeMode(): ThemeMode {
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function saveThemeMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
}

/** 霓虹渐变主色板（图表 series 依次取用） */
export const NEON_COLORS = ['#22d3ee', '#818cf8', '#e879f9', '#34d399', '#fbbf24', '#38bdf8']

const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#22d3ee',
    colorInfo: '#22d3ee',
    colorSuccess: '#34d399',
    colorWarning: '#fbbf24',
    colorError: '#f87171',
    colorBgBase: '#070b16',
    colorBgLayout: 'transparent',
    colorBgContainer: 'rgba(148, 163, 184, 0.055)',
    colorBgElevated: 'rgba(17, 25, 46, 0.96)',
    // Tooltip 弹层背景（antd v6 默认是亮蓝色，这里改成主题深色）
    colorBgSpotlight: 'rgba(10, 16, 30, 0.97)',
    colorBorder: 'rgba(148, 163, 184, 0.20)',
    colorBorderSecondary: 'rgba(148, 163, 184, 0.12)',
    colorText: '#e6eef8',
    colorTextSecondary: 'rgba(199, 212, 229, 0.78)',
    colorTextTertiary: 'rgba(154, 170, 192, 0.60)',
    borderRadius: 10,
    fontSize: 13
  },
  components: {
    Layout: { siderBg: 'rgba(9, 14, 28, 0.72)', headerBg: 'rgba(9, 14, 28, 0.55)', bodyBg: 'transparent' },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: 'rgba(34, 211, 238, 0.13)',
      itemSelectedColor: '#4de3f7',
      itemHoverBg: 'rgba(148, 163, 184, 0.08)',
      itemBorderRadius: 8,
      activeBarBorderWidth: 0
    },
    Card: { colorBgContainer: 'rgba(148, 163, 184, 0.055)', colorBorderSecondary: 'rgba(148, 163, 184, 0.13)' },
    Table: {
      headerBg: 'rgba(148, 163, 184, 0.08)',
      rowHoverBg: 'rgba(34, 211, 238, 0.06)',
      headerSplitColor: 'transparent'
    },
    Statistic: { contentFontSize: 24 },
    Progress: { remainingColor: 'rgba(148, 163, 184, 0.2)' }
  }
}

const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#0ea5e9',
    colorInfo: '#0ea5e9',
    colorBgBase: '#eef2f9',
    colorBgLayout: 'transparent',
    colorBgContainer: 'rgba(255, 255, 255, 0.82)',
    colorBgElevated: 'rgba(255, 255, 255, 0.98)',
    colorBgSpotlight: 'rgba(255, 255, 255, 0.99)',
    colorBorder: 'rgba(100, 116, 139, 0.24)',
    colorBorderSecondary: 'rgba(100, 116, 139, 0.14)',
    borderRadius: 10,
    fontSize: 13
  },
  components: {
    Layout: { siderBg: 'rgba(255, 255, 255, 0.75)', headerBg: 'rgba(255, 255, 255, 0.65)', bodyBg: 'transparent' },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: 'rgba(14, 165, 233, 0.12)',
      itemSelectedColor: '#0284c7',
      itemBorderRadius: 8,
      activeBarBorderWidth: 0
    },
    Card: { colorBgContainer: 'rgba(255, 255, 255, 0.82)', colorBorderSecondary: 'rgba(100, 116, 139, 0.16)' },
    Table: { headerBg: 'rgba(100, 116, 139, 0.07)', headerSplitColor: 'transparent' },
    Statistic: { contentFontSize: 24 }
  }
}

export function getThemeConfig(mode: ThemeMode): ThemeConfig {
  return mode === 'dark' ? darkTheme : lightTheme
}

let themesRegistered = false

/** 注册 ECharts 主题（幂等），Chart 组件按模式取用 */
export function ensureEchartsThemes(): void {
  if (themesRegistered) return
  const axisLabel = (color: string): object => ({ color, fontSize: 11 })
  const axisLine = (color: string): object => ({ lineStyle: { color } })
  const splitLine = (color: string): object => ({ lineStyle: { color } })

  echarts.registerTheme('hotflow-dark', {
    backgroundColor: 'transparent',
    color: NEON_COLORS,
    textStyle: { color: 'rgba(214, 226, 240, 0.85)' },
    legend: { textStyle: { color: 'rgba(199, 212, 229, 0.78)', fontSize: 11 } },
    tooltip: {
      backgroundColor: 'rgba(10, 16, 32, 0.94)',
      borderColor: 'rgba(34, 211, 238, 0.35)',
      borderWidth: 1,
      textStyle: { color: '#e6eef8', fontSize: 12 }
    },
    categoryAxis: {
      axisLine: axisLine('rgba(148, 163, 184, 0.30)'),
      axisTick: { show: false },
      axisLabel: axisLabel('rgba(160, 175, 196, 0.85)'),
      splitLine: splitLine('rgba(148, 163, 184, 0.07)')
    },
    valueAxis: {
      axisLine: { show: false },
      axisLabel: axisLabel('rgba(160, 175, 196, 0.85)'),
      splitLine: splitLine('rgba(148, 163, 184, 0.10)')
    }
  })

  echarts.registerTheme('hotflow-light', {
    backgroundColor: 'transparent',
    color: ['#0ea5e9', '#6366f1', '#d946ef', '#10b981', '#f59e0b', '#0284c7'],
    textStyle: { color: 'rgba(30, 41, 59, 0.88)' },
    legend: { textStyle: { color: 'rgba(51, 65, 85, 0.85)', fontSize: 11 } },
    tooltip: {
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: 'rgba(14, 165, 233, 0.4)',
      borderWidth: 1,
      textStyle: { color: '#1e293b', fontSize: 12 }
    },
    categoryAxis: {
      axisLine: axisLine('rgba(100, 116, 139, 0.35)'),
      axisTick: { show: false },
      axisLabel: axisLabel('rgba(71, 85, 105, 0.9)'),
      splitLine: splitLine('rgba(100, 116, 139, 0.08)')
    },
    valueAxis: {
      axisLine: { show: false },
      axisLabel: axisLabel('rgba(71, 85, 105, 0.9)'),
      splitLine: splitLine('rgba(100, 116, 139, 0.12)')
    }
  })

  themesRegistered = true
}

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue>({ mode: 'dark', setMode: () => undefined })

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
