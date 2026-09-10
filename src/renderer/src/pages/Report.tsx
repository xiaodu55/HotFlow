import { useEffect, useState } from 'react'
import { Alert, App, Button, Modal, Space, Spin, Typography } from 'antd'
import { ExportOutlined, ProfileOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'

interface WeeklyReport {
  markdown: string
  aiGenerated: boolean
  note?: string
}

interface Props {
  currentId: string | null
  compareId: string | undefined
}

export default function ReportPage({ currentId, compareId }: Props) {
  const { message } = App.useApp()
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)

  useEffect(() => {
    if (!currentId) {
      setHtml(null)
      return
    }
    let alive = true
    setLoading(true)
    window.api
      .buildReport(currentId, compareId)
      .then((r) => {
        if (alive) setHtml(r.html)
      })
      .catch((err) => {
        if (alive) message.error(`报告生成失败：${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, compareId])

  async function doExport() {
    if (!currentId) return
    setExporting(true)
    try {
      const r = await window.api.exportReport(currentId, compareId)
      if (!r.canceled && r.path) message.success(`已导出：${r.path}`)
    } catch (err) {
      message.error(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  async function genWeekly() {
    if (!currentId) return
    setWeeklyLoading(true)
    try {
      setWeekly(await window.api.generateWeeklyReport(currentId))
    } catch (err) {
      message.error(`周报生成失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setWeeklyLoading(false)
    }
  }

  async function copyWeekly() {
    if (!weekly) return
    try {
      await navigator.clipboard.writeText(weekly.markdown)
      message.success('周报全文已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动选择文本复制')
    }
  }

  return (
    <div>
      <PageHeader
        title="分析报告"
        description="实时预览 · 导出单文件 HTML（内含图表与 AI 诊断，离线可开）· 浏览器打开后 Ctrl+P 可打印为 PDF"
        extra={
          <Space>
            <Button icon={<ProfileOutlined />} loading={weeklyLoading} onClick={genWeekly} disabled={!currentId}>
              生成周报文案
            </Button>
            <Button type="primary" icon={<ExportOutlined />} loading={exporting} onClick={doExport} disabled={!currentId}>
              导出 HTML 报告
            </Button>
          </Space>
        }
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin tip="正在生成报告…" />
        </div>
      ) : (
        <iframe className="report-frame" title="报告预览" srcDoc={html ?? ''} />
      )}

      <Modal
        title={weekly?.aiGenerated ? 'AI 运营周报' : '运营周报（数据模板）'}
        open={!!weekly}
        onCancel={() => setWeekly(null)}
        width={760}
        footer={[
          <Button key="copy" type="primary" onClick={() => void copyWeekly()}>
            复制全文
          </Button>,
          <Button key="close" onClick={() => setWeekly(null)}>
            关闭
          </Button>
        ]}
      >
        {weekly?.note && (
          <Alert type="warning" showIcon message={weekly.note} style={{ marginBottom: 12 }} />
        )}
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: 1.8,
            margin: 0,
            maxHeight: 480,
            overflow: 'auto'
          }}
        >
          {weekly?.markdown}
        </pre>
      </Modal>
    </div>
  )
}
