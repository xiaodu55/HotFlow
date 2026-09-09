import { useEffect, useState } from 'react'
import { App, Button, Card, Space, Spin, Typography } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'

interface Props {
  currentId: string | null
  compareId: string | undefined
}

export default function ReportPage({ currentId, compareId }: Props) {
  const { message } = App.useApp()
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

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

  return (
    <div>
      <PageHeader
        title="分析报告"
        description="实时预览 · 导出单文件 HTML（内含图表与 AI 诊断，离线可开）· 浏览器打开后 Ctrl+P 可打印为 PDF"
        extra={
          <Button type="primary" icon={<ExportOutlined />} loading={exporting} onClick={doExport} disabled={!currentId}>
            导出 HTML 报告
          </Button>
        }
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin tip="正在生成报告…" />
        </div>
      ) : (
        <iframe className="report-frame" title="报告预览" srcDoc={html ?? ''} />
      )}
    </div>
  )
}
