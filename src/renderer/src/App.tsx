import { useCallback, useEffect, useState } from 'react'
import { App as AntApp, Empty, Layout, Menu, Button } from 'antd'
import {
  DatabaseOutlined,
  DashboardOutlined,
  FileTextOutlined,
  RobotOutlined,
  SettingOutlined,
  TableOutlined
} from '@ant-design/icons'
import type { AnalysisResult, AppSettings, DiagnosisResult, Snapshot, SnapshotMeta } from '@shared/types'
import ImportPage from './pages/Import'
import DashboardPage from './pages/Dashboard'
import VideosPage from './pages/Videos'
import DiagnosisPage from './pages/Diagnosis'
import ReportPage from './pages/Report'
import SettingsPage from './pages/Settings'

export type PageKey = 'import' | 'dashboard' | 'videos' | 'diagnosis' | 'report' | 'settings'

const MENU_ITEMS = [
  { key: 'import', icon: <DatabaseOutlined />, label: '导入数据' },
  { key: 'dashboard', icon: <DashboardOutlined />, label: '数据看板' },
  { key: 'videos', icon: <TableOutlined />, label: '视频明细' },
  { key: 'diagnosis', icon: <RobotOutlined />, label: 'AI 诊断' },
  { key: 'report', icon: <FileTextOutlined />, label: '分析报告' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' }
]

export default function App() {
  const [page, setPage] = useState<PageKey>('import')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const refreshSnapshots = useCallback(async () => {
    const list = await window.api.listSnapshots()
    setSnapshots(list)
    return list
  }, [])

  useEffect(() => {
    void refreshSnapshots()
    void window.api.getSettings().then(setSettings)
  }, [refreshSnapshots])

  useEffect(() => {
    if (!currentId) {
      setSnapshot(null)
      setAnalysis(null)
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
      .catch(() => undefined)
    window.api
      .runAnalysis(currentId)
      .then((a) => {
        if (alive) setAnalysis(a)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [currentId])

  const needData = !currentId && page !== 'import' && page !== 'settings'
  const needAnalysis = (page === 'dashboard' || page === 'videos') && currentId && !analysis

  return (
    <AntApp>
      <Layout style={{ height: '100vh' }}>
        <Layout.Sider width={200} theme="dark">
          <div className="brand">📊 HotFlow 视频运营分析</div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[page]}
            items={MENU_ITEMS}
            onClick={(e) => setPage(e.key as PageKey)}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 20, overflow: 'auto', background: '#f4f6f9' }}>
          {needData ? (
            <Empty
              style={{ marginTop: 120 }}
              description="还没有数据，先导入一份平台导出的表格吧"
            >
              <Button type="primary" onClick={() => setPage('import')}>
                去导入数据
              </Button>
            </Empty>
          ) : needAnalysis ? (
            <Empty style={{ marginTop: 120 }} description="分析计算中…" />
          ) : page === 'import' ? (
            <ImportPage
              snapshots={snapshots}
              refresh={refreshSnapshots}
              onOpen={(id) => {
                setCurrentId(id)
                setPage('dashboard')
              }}
              onImported={(id) => {
                setCurrentId(id)
                setPage('dashboard')
              }}
            />
          ) : page === 'dashboard' ? (
            <DashboardPage analysis={analysis} />
          ) : page === 'videos' ? (
            <VideosPage snapshot={snapshot} analysis={analysis} />
          ) : page === 'diagnosis' ? (
            <DiagnosisPage
              currentId={currentId}
              diagnosis={diagnosis}
              onDiagnosis={setDiagnosis}
              settings={settings}
              onNavigate={setPage}
            />
          ) : page === 'report' ? (
            <ReportPage currentId={currentId} />
          ) : (
            <SettingsPage settings={settings} onSaved={setSettings} />
          )}
        </Layout.Content>
      </Layout>
    </AntApp>
  )
}
