import { useRef, useState } from 'react'
import { Alert, App, Button, Card, Modal, Popconfirm, Select, Space, Steps, Table, Tag } from 'antd'
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons'
import { FIELD_LABELS, PLATFORMS, type StandardField } from '@shared/platforms'
import type { Snapshot, SnapshotMeta, TableInspect } from '@shared/types'
import PageHeader from '../components/PageHeader'
import { fmtTime } from '../utils'

interface Props {
  snapshots: SnapshotMeta[]
  refresh: () => Promise<SnapshotMeta[]>
  onOpen: (id: string) => void
  onImported: (id: string) => void
}

const PLATFORM_KEY = 'hotflow-platform'

interface ImportOutcomeRow {
  fileName: string
  ok: boolean
  count?: number
  error?: string
}

function loadLastPlatform(): string {
  const v = localStorage.getItem(PLATFORM_KEY)
  return PLATFORMS.some((p) => p.id === v) ? (v as string) : 'douyin'
}

export default function ImportPage({ snapshots, refresh, onOpen, onImported }: Props) {
  const { message } = App.useApp()
  const [platform, setPlatformState] = useState<string>(loadLastPlatform)
  const [importing, setImporting] = useState(false)
  const [outcomes, setOutcomes] = useState<ImportOutcomeRow[] | null>(null)
  const [inspect, setInspect] = useState<{ open: boolean; filePath: string; data: TableInspect | null }>({
    open: false,
    filePath: '',
    data: null
  })
  const inputRef = useRef<HTMLInputElement>(null)

  function setPlatform(id: string) {
    setPlatformState(id)
    localStorage.setItem(PLATFORM_KEY, id)
  }

  async function importAll(paths: string[]) {
    setImporting(true)
    const rows: ImportOutcomeRow[] = []
    let lastId: string | null = null
    for (const p of paths) {
      const fileName = p.split(/[\\/]/).pop() ?? p
      try {
        const { snapshot } = await window.api.importFile(p, platform)
        rows.push({ fileName, ok: true, count: snapshot.recordCount })
        lastId = snapshot.id
      } catch (err) {
        rows.push({ fileName, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
    setOutcomes(rows)
    await refresh()
    setImporting(false)
    const okCount = rows.filter((r) => r.ok).length
    if (okCount === rows.length) message.success(`成功导入 ${okCount} 个文件`)
    else message.warning(`${okCount} 个成功，${rows.length - okCount} 个失败`)
    if (lastId) onImported(lastId)
  }

  async function handleFiles(files: File[]) {
    const valid = files.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name))
    if (valid.length === 0) {
      message.error('仅支持 xlsx / xls / csv 文件')
      return
    }
    const paths = valid.map((f) => window.api.getPathForFile(f))
    if (paths.length === 1) {
      // 单文件先做列映射预检，确认后再落库
      try {
        const data = await window.api.inspectTable(paths[0], platform)
        setInspect({ open: true, filePath: paths[0], data })
      } catch (err) {
        message.error(`解析失败：${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      await importAll(paths)
    }
  }

  const fieldByColumn = new Map(Object.entries(inspect.data?.fieldColumns ?? {}))

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <PageHeader title="导入数据" description="支持拖拽或点击选择，xlsx / xls / csv；导入前会预览列识别结果" />

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            <Select
              value={platform}
              onChange={setPlatform}
              style={{ width: 240 }}
              options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
            />
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={importing}
              onClick={() => inputRef.current?.click()}
            >
              选择文件
            </Button>
          </Space>

          <div
            className="dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void handleFiles(Array.from(e.dataTransfer.files))
            }}
          >
            <InboxOutlined style={{ fontSize: 36, color: '#22d3ee' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>拖拽表格文件到此处，或点击选择</div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(148,163,184,0.9)' }}>
              支持多文件批量导入 · 列名自动识别 · 数字/百分比/时长格式自动归一化
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              void handleFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />

          {outcomes && (
            <Alert
              type={outcomes.every((r) => r.ok) ? 'success' : 'warning'}
              showIcon
              message={`本次导入：${outcomes.filter((r) => r.ok).length} 成功 / ${outcomes.filter((r) => !r.ok).length} 失败`}
              description={
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {outcomes.map((r, i) => (
                    <li key={i}>
                      {r.ok ? (
                        <>
                          <Tag color="success" bordered={false}>
                            成功
                          </Tag>
                          {r.fileName}（{r.count} 条）
                        </>
                      ) : (
                        <>
                          <Tag color="error" bordered={false}>
                            失败
                          </Tag>
                          {r.fileName}：{r.error}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              }
              closable
              onClose={() => setOutcomes(null)}
            />
          )}
        </Space>
      </Card>

      <Card title="导入历史" styles={{ body: { paddingTop: snapshots.length ? 8 : 24 } }}>
        {snapshots.length === 0 ? (
          <Steps
            direction="vertical"
            size="small"
            current={-1}
            items={[
              { title: '导出数据', description: '在平台创作者后台导出作品数据表（Excel 或 CSV）' },
              { title: '拖入导入', description: '把文件拖到上方导入区，确认列映射后自动入库' },
              { title: '看板与诊断', description: '在数据看板查看指标与环比，配置大模型后生成 AI 诊断' }
            ]}
          />
        ) : (
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
                render: (v: string) => <Tag color="cyan" bordered={false}>{v}</Tag>
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
                    <Popconfirm
                      title="确定删除这份数据？"
                      onConfirm={async () => {
                        await window.api.deleteSnapshot(record.id)
                        await refresh()
                        message.success('已删除')
                      }}
                    >
                      <Button type="link" size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                )
              }
            ]}
          />
        )}
      </Card>

      <Modal
        title={`导入前预检：${inspect.data?.fileName ?? ''}`}
        open={inspect.open}
        onCancel={() => setInspect({ open: false, filePath: '', data: null })}
        footer={[
          <Button key="cancel" onClick={() => setInspect({ open: false, filePath: '', data: null })}>
            取消
          </Button>,
          <Button
            key="ok"
            type="primary"
            loading={importing}
            onClick={async () => {
              const p = inspect.filePath
              setInspect({ open: false, filePath: '', data: null })
              await importAll([p])
            }}
          >
            确认导入
          </Button>
        ]}
      >
        {inspect.data && (
          <>
            <p style={{ marginTop: 0 }}>
              共解析出 <b>{inspect.data.rowCount}</b> 行数据，列识别结果如下：
            </p>
            <Table
              size="small"
              pagination={false}
              dataSource={inspect.data.headers.map((h) => ({ key: h, header: h, sample: inspect.data?.samples[h] ?? '' }))}
              columns={[
                { title: '表格列名', dataIndex: 'header', ellipsis: true },
                {
                  title: '识别为',
                  dataIndex: 'header',
                  width: 140,
                  render: (h: string) => {
                    const field = fieldByColumn.get(h)
                    return field ? (
                      <Tag color="cyan" bordered={false}>
                        {FIELD_LABELS[field as StandardField]}
                      </Tag>
                    ) : (
                      <Tag bordered={false}>未识别</Tag>
                    )
                  }
                },
                { title: '样例值', dataIndex: 'sample', ellipsis: true }
              ]}
            />
            {inspect.data.unmappedColumns.length > 0 && (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message={`有 ${inspect.data.unmappedColumns.length} 列未识别用途（不影响导入）：${inspect.data.unmappedColumns.join('、')}`}
              />
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
