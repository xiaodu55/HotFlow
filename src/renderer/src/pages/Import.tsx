import { useState } from 'react'
import { Alert, App, Button, Card, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { PLATFORMS } from '@shared/platforms'
import type { Snapshot, SnapshotMeta } from '@shared/types'
import { fmtTime } from '../utils'

interface Props {
  snapshots: SnapshotMeta[]
  refresh: () => Promise<SnapshotMeta[]>
  onOpen: (id: string) => void
  onImported: (id: string) => void
}

export default function ImportPage({ snapshots, refresh, onOpen, onImported }: Props) {
  const { message } = App.useApp()
  const [platform, setPlatform] = useState<string>('douyin')
  const [importing, setImporting] = useState(false)
  const [lastResult, setLastResult] = useState<Snapshot | null>(null)

  async function handleImport() {
    setImporting(true)
    try {
      const outcome = await window.api.pickAndImport(platform)
      if (!outcome) return
      setLastResult(outcome.snapshot)
      await refresh()
      message.success(`导入成功，共解析出 ${outcome.snapshot.recordCount} 条视频`)
      onImported(outcome.snapshot.id)
    } catch (err) {
      message.error(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete(id: string) {
    await window.api.deleteSnapshot(id)
    await refresh()
    message.success('已删除')
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <Card title="导入数据" style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          从平台创作者后台导出作品数据表（Excel / CSV），选择对应平台后导入。
          列名会自动识别；识别不了的列会保留原始列名并提示。
        </Typography.Paragraph>
        <Space wrap>
          <Select
            value={platform}
            onChange={setPlatform}
            style={{ width: 240 }}
            options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <Button type="primary" icon={<DownloadOutlined />} loading={importing} onClick={handleImport}>
            选择文件并导入
          </Button>
        </Space>

        {lastResult && (lastResult.warnings.length > 0 || lastResult.unmappedColumns.length > 0) && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="导入完成，但有以下提示"
            description={
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {lastResult.warnings.map((w, i) => (
                  <li key={`w${i}`}>{w}</li>
                ))}
                {lastResult.unmappedColumns.length > 0 && (
                  <li>
                    未识别用途的列（不影响导入）：
                    {lastResult.unmappedColumns.join('、')}
                  </li>
                )}
              </ul>
            }
          />
        )}
      </Card>

      <Card title="导入历史" styles={{ body: { paddingTop: 8 } }}>
        <Table<SnapshotMeta>
          rowKey="id"
          dataSource={snapshots}
          size="middle"
          pagination={{ pageSize: 8, showSizeChanger: false }}
          columns={[
            { title: '导入时间', dataIndex: 'importedAt', width: 150, render: fmtTime },
            {
              title: '平台',
              dataIndex: 'platformLabel',
              width: 110,
              render: (v: string) => <Tag color="blue">{v}</Tag>
            },
            { title: '文件名', dataIndex: 'fileName', ellipsis: true },
            { title: '视频数', dataIndex: 'recordCount', width: 90 },
            {
              title: '操作',
              key: 'action',
              width: 150,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => onOpen(record.id)}>
                    查看
                  </Button>
                  <Popconfirm title="确定删除这份数据？" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}
