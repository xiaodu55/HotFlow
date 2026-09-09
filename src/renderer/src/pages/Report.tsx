import { useEffect, useState } from 'react'
import { App, Button, Card, Space, Spin, Typography } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import type { PageKey } from '../App'

interface Props {
  currentId: string | null
}

export default function ReportPage({ currentId }: Props) {
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
      .buildReport(currentId)
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
  }, [currentId])

  async function doExport() {
    if (!currentId) return
    setExporting(true)
    try {
      const r = await window.api.exportReport(currentId)
      if (!r.canceled && r.path) message.success(`已导出：${r.path}`)
    } catch (err) {
      message.error(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Typography.Text type="secondary">
            下方为报告实时预览。导出的 HTML 为单文件报告（含图表与 AI 诊断），双击即可离线打开。
          </Typography.Text>
          <Button type="primary" icon={<ExportOutlined />} loading={exporting} onClick={doExport} disabled={!currentId}>
            导出 HTML 报告
          </Button>
        </Space>
      </Card>
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
