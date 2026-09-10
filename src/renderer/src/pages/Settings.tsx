import { useState } from 'react'
import { Alert, App, Button, Card, Form, Input, Select, Space, Typography } from 'antd'
import { CloudDownloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import { LLM_PRESETS, getPreset } from '@shared/llm-presets'
import type { AppSettings, LlmProviderId } from '@shared/types'
import PageHeader from '../components/PageHeader'

interface Props {
  settings: AppSettings | null
  onSaved: (s: AppSettings) => void
  /** 备份导入后刷新快照列表 */
  onSnapshotsChanged: () => Promise<unknown>
}

export default function SettingsPage({ settings, onSaved, onSnapshotsChanged }: Props) {
  const { message } = App.useApp()
  const [provider, setProvider] = useState<LlmProviderId>(settings?.llm.provider ?? 'deepseek')
  const [baseURL, setBaseURL] = useState(settings?.llm.baseURL ?? getPreset('deepseek').baseURL)
  const [apiKey, setApiKey] = useState(settings?.llm.apiKey ?? '')
  const [model, setModel] = useState(settings?.llm.model ?? getPreset('deepseek').defaultModel)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [backuping, setBackuping] = useState<'export' | 'import' | null>(null)

  const preset = getPreset(provider)

  function onProviderChange(id: LlmProviderId) {
    setProvider(id)
    const p = getPreset(id)
    if (p.baseURL) {
      setBaseURL(p.baseURL)
      setModel(p.defaultModel)
    } else {
      setBaseURL('')
      setModel('')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const next: AppSettings = { llm: { provider, baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: model.trim() } }
      await window.api.saveSettings(next)
      onSaved(next)
      message.success('设置已保存')
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      // 只测当前表单值，不落盘——避免覆盖已保存的配置
      const r = await window.api.testLlm({ provider, baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: model.trim() })
      if (r.ok) message.success(r.message)
      else message.error(r.message)
    } finally {
      setTesting(false)
    }
  }

  async function exportBackup() {
    setBackuping('export')
    try {
      const r = await window.api.exportBackup()
      if (!r.canceled && r.path) message.success(`已导出 ${r.snapshots} 份快照：${r.path}`)
    } catch (err) {
      message.error(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBackuping(null)
    }
  }

  async function importBackup() {
    setBackuping('import')
    try {
      const r = await window.api.importBackup()
      if (!r.canceled) {
        await onSnapshotsChanged()
        message.success(`已恢复 ${r.snapshots ?? 0} 份快照${r.settings ? '（含大模型设置）' : ''}`)
      }
    } catch (err) {
      message.error(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBackuping(null)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader title="设置" description="大模型接口配置，API Key 仅保存在本机" />
      <Card>
        <Typography.Paragraph type="secondary">
          内容诊断与策略建议通过 OpenAI 兼容接口调用大模型。API Key 仅保存在本机用户数据目录，不会上传到任何服务器。
        </Typography.Paragraph>
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="服务商">
            <Select
              value={provider}
              onChange={onProviderChange}
              options={LLM_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            />
          </Form.Item>
          <Form.Item label="Base URL" extra={preset.note}>
            <Input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item
            label="API Key"
            extra={
              preset.applyUrl ? (
                <a href={preset.applyUrl} target="_blank" rel="noreferrer">
                  前往 {preset.label} 开放平台获取 API Key ↗
                </a>
              ) : undefined
            }
          >
            <Input.Password value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          </Form.Item>
          <Form.Item label="模型名">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="如 deepseek-chat / glm-4-flash / qwen-plus" />
          </Form.Item>
          <Space>
            <Button type="primary" loading={saving} onClick={save}>
              保存
            </Button>
            <Button loading={testing} onClick={test}>
              测试连接
            </Button>
          </Space>
        </Form>
      </Card>

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="没有 API Key？"
        description="智谱的 glm-4-flash 模型免费，注册即可使用；DeepSeek 价格也很低（百万 token 约几元），适合这种数据分析场景。"
      />

      <Card title="数据管理" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          所有导入的快照和大模型配置只保存在本机。定期导出备份文件（单个 JSON，含全部快照与设置），
          重装系统或换电脑时可通过「导入备份」完整恢复。
        </Typography.Paragraph>
        <Space>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={backuping === 'export'}
            onClick={exportBackup}
          >
            导出全部数据
          </Button>
          <Button icon={<CloudUploadOutlined />} loading={backuping === 'import'} onClick={importBackup}>
            导入备份
          </Button>
        </Space>
      </Card>
    </div>
  )
}
