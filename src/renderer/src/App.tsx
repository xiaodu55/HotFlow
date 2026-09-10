import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Alert, App as AntApp, Button, ConfigProvider, Empty, Layout, Menu, Result, Spin, Switch, Tooltip } from 'antd'
import {
  DatabaseOutlined,
  DashboardOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  SunOutlined,
  TableOutlined
} from '@ant-design/icons'
import type { AnalysisResult, AppSettings, DiagnosisResult, Snapshot, SnapshotMeta } from '@shared/types'
import {
  ThemeContext,
  getThemeConfig,
  loadThemeMode,
  saveThemeMode,
  type ThemeMode
} from './theme'
import ErrorBoundary from './components/ErrorBoundary'

// 页面级代码分割：各页按需加载，降低首屏 JS 解析成本
const ImportPage = lazy(() => import('./pages/Import'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const VideosPage = lazy(() => import('./pages/Videos'))
const DiagnosisPage = lazy(() => import('./pages/Diagnosis'))
const ReportPage = lazy(() => import('./pages/Report'))
const SettingsPage = lazy(() => import('./pages/Settings'))

export type PageKey = 'import' | 'dashboard' | 'videos' | 'diagnosis' | 'report' | 'settings'

const MENU_ITEMS = [
  { key: 'import', icon: <DatabaseOutlined />, label: '导入数据' },
  { key: 'dashboard', icon: <DashboardOutlined />, label: '数据看板' },
  { key: 'videos', icon: <TableOutlined />, label: '视频明细' },
  { key: 'diagnosis', icon: <RobotOutlined />, label: 'AI 诊断' },
  { key: 'report', icon: <FileTextOutlined />, label: '分析报告' },
  { type: 'group' as const, label: '系统', children: [{ key: 'settings', icon: <SettingOutlined />, label: '设置' }] }
]

export default function App() {
  const { message } = AntApp.useApp()
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode)
  const [collapsed, setCollapsed] = useState(false)
  const [page, setPage] = useState<PageKey>('import')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [compareId, setCompareId] = useState<string | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisReload, setAnalysisReload] = useState(0)
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    saveThemeMode(m)
  }, [])

  /** 统一的选择快照入口：切数据时清掉对比期，避免残留的 compareId 跨账号/跨平台 */
  const selectSnapshot = useCallback((id: string) => {
    setCurrentId(id)
    setCompareId(undefined)
  }, [])

  const refreshSnapshots = useCallback(async () => {
    const list = await window.api.listSnapshots()
    setSnapshots(list)
    return list
  }, [])

  useEffect(() => {
    document.body.className = `tech-${mode}`
  }, [mode])

  useEffect(() => {
    void refreshSnapshots()
    void window.api.getSettings().then(setSettings)
  }, [refreshSnapshots])

  useEffect(() => {
    if (!currentId) {
      setSnapshot(null)
      setDiagnosis(null)
      return
    }
    let alive = true
    window.api
      .getSnapshot(currentId)
      .then((r) => {
        if (alive) {
          setSnapshot(r.snapshot)
          setDiagnosis(r.diagnosis)
        }
      })
      .catch((err) => {
        if (alive) message.error(`数据加载失败：${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      alive = false
    }
  }, [currentId, message])

  useEffect(() => {
    if (!currentId) {
      setAnalysis(null)
      setAnalysisError(null)
      return
    }
    let alive = true
    setAnalysis(null)
    setAnalysisError(null)
    window.api
      .runAnalysis(currentId, compareId)
      .then((a) => {
        if (alive) setAnalysis(a)
      })
      .catch((err) => {
        if (alive) {
          const msg = err instanceof Error ? err.message : String(err)
          setAnalysisError(msg)
          message.error(`分析计算失败：${msg}`)
        }
      })
    return () => {
      alive = false
    }
  }, [currentId, compareId, analysisReload, message])

  const needData = !currentId && page !== 'import' && page !== 'settings'
  const analyzing =
    (page === 'dashboard' || page === 'videos') && currentId && !analysis && !analysisError

  return (
    <ConfigProvider theme={getThemeConfig(mode)}>
      <ThemeContext.Provider value={{ mode, setMode }}>
        <AntApp>
          <Layout style={{ height: '100vh', position: 'relative', zIndex: 1 }}>
            <Layout.Sider
              width={208}
              collapsedWidth={72}
              collapsed={collapsed}
              trigger={null}
              collapsible
            >
              <div className="brand">{collapsed ? '📊' : '📊 HotFlow'}</div>
              <Menu
                mode="inline"
                inlineCollapsed={collapsed}
                selectedKeys={[page]}
                items={MENU_ITEMS}
                onClick={(e) => setPage(e.key as PageKey)}
              />
            </Layout.Sider>
            <Layout>
              <Layout.Header
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingInline: 16,
                  height: 48,
                  lineHeight: '48px'
                }}
              >
                <Button
                  type="text"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed(!collapsed)}
                />
                <Tooltip title={mode === 'dark' ? '切换到亮色' : '切换到暗色'}>
                  <Switch
                    checked={mode === 'dark'}
                    checkedChildren={<MoonOutlined />}
                    unCheckedChildren={<SunOutlined />}
                    onChange={(v) => setMode(v ? 'dark' : 'light')}
                  />
                </Tooltip>
              </Layout.Header>
              <Layout.Content style={{ padding: '8px 20px 20px', overflow: 'auto', position: 'relative' }}>
                <ErrorBoundary>
                <Suspense
                  fallback={
                    <div style={{ textAlign: 'center', marginTop: 140 }}>
                      <Spin />
                    </div>
                  }
                >
                {needData ? (
                  <Empty style={{ marginTop: 120 }} description="还没有数据，先导入一份平台导出的表格吧">
                    <Button type="primary" onClick={() => setPage('import')}>
                      去导入数据
                    </Button>
                  </Empty>
                ) : analyzing ? (
                  <div style={{ textAlign: 'center', marginTop: 140 }}>
                    <Spin tip="正在计算指标与环比…" />
                  </div>
                ) : page === 'import' ? (
                  <ImportPage
                    snapshots={snapshots}
                    currentId={currentId}
                    refresh={refreshSnapshots}
                    onOpen={(id) => {
                      selectSnapshot(id)
                      setPage('dashboard')
                    }}
                    onImported={(id) => {
                      selectSnapshot(id)
                      setPage('dashboard')
                    }}
                    onDeleteCurrent={() => setCurrentId(null)}
                  />
                ) : page === 'dashboard' ? (
                  <DashboardPage
                    analysis={analysis}
                    snapshot={snapshot}
                    snapshots={snapshots}
                    compareId={compareId}
                    onCompareChange={setCompareId}
                  />
                ) : page === 'videos' ? (
                  <VideosPage snapshot={snapshot} analysis={analysis} />
                ) : page === 'diagnosis' ? (
                  <DiagnosisPage
                    currentId={currentId}
                    diagnosis={diagnosis}
                    onDiagnosis={setDiagnosis}
                    settings={settings}
                    onNavigate={setPage}
                    compareId={compareId}
                  />
                ) : page === 'report' ? (
                  <ReportPage currentId={currentId} compareId={compareId} />
                  ) : (
                    <SettingsPage settings={settings} onSaved={setSettings} onSnapshotsChanged={refreshSnapshots} />
                  )}
                </Suspense>
                </ErrorBoundary>
              </Layout.Content>
            </Layout>
          </Layout>
        </AntApp>
      </ThemeContext.Provider>
    </ConfigProvider>
  )
}
