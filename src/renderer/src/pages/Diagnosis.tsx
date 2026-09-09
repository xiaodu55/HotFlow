import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, App, Button, Card, Descriptions, Empty, List, Result, Space, Typography } from 'antd'
import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { AppSettings, DiagnosisResult } from '@shared/types'
import type { PageKey } from '../App'

interface Props {
  currentId: string | null
  diagnosis: DiagnosisResult | null
  onDiagnosis: (d: DiagnosisResult) => void
  settings: AppSettings | null
  onNavigate: (page: PageKey) => void
}

function listBlock(title: string, items: string[], color: string): ReactNode {
  if (items.length === 0) return null
  return (
    <Card size="small" title={<span style={{ color }}>{title}</span>} style={{ marginBottom: 16 }}>
      <List
        size="small"
        dataSource={items}
        renderItem={(item) => (
          <List.Item style={{ padding: '6px 0' }}>
            <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{item}</Typography.Text>
          </List.Item>
        )}
      />
    </Card>
  )
}

export default function DiagnosisPage({
  currentId,
  diagnosis,
  onDiagnosis,
  settings,
  onNavigate
}: Props) {
  const { message } = App.useApp()
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')

  const llmReady = Boolean(
    settings && settings.llm.apiKey.trim() && settings.llm.baseURL.trim() && settings.llm.model.trim()
  )

  useEffect(() => window.api.onLlmChunk((text) => setStreamText((prev) => prev + text)), [])

  async function run() {
    if (!currentId) return
    setStreaming(true)
    setStreamText('')
    try {
      const d = await window.api.runDiagnosis(currentId)
      onDiagnosis(d)
      message.success('AI 诊断完成')
    } catch (err) {
      message.error(`诊断失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStreaming(false)
    }
  }

  if (!currentId) {
    return <Empty style={{ marginTop: 120 }} description="先导入数据，再生成 AI 诊断" />
  }

  if (!llmReady) {
    return (
      <Result
        style={{ marginTop: 60 }}
        status="warning"
        title="尚未配置大模型"
        subTitle="内容诊断与策略建议需要接入一个 OpenAI 兼容的大模型接口（DeepSeek / 智谱 GLM / 通义千问均可）。API Key 只保存在本机。"
        extra={
          <Button type="primary" onClick={() => onNavigate('settings')}>
            去设置
          </Button>
        }
      />
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Card
        title={
          <Space>
            <RobotOutlined />
            AI 内容诊断与发布策略
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={streaming}
            onClick={run}
          >
            {diagnosis ? '重新生成' : '生成诊断'}
          </Button>
        }
      >
        {!diagnosis && !streaming && (
          <Typography.Paragraph type="secondary">
            基于当前数据的整体指标、趋势、时段表现和 Top/Bottom 视频明细，
            由大模型给出爆款共性、低效归因和可执行的运营建议。首次生成约需 10~60 秒。
          </Typography.Paragraph>
        )}

        {streaming && (
          <>
            <Alert type="info" showIcon message="模型分析中，以下是实时输出…" style={{ marginBottom: 12 }} />
            <div className="stream-box">{streamText || '正在连接模型…'}</div>
          </>
        )}

        {!streaming && diagnosis && (
          <>
            <Alert
              type="success"
              showIcon
              message="整体总结"
              description={diagnosis.summary}
              style={{ marginBottom: 16 }}
            />
            {diagnosis.rawText ? (
              <>
                <div className="stream-box" style={{ maxHeight: 480 }}>{diagnosis.rawText}</div>
                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                  模型未按约定格式输出，以上为原文。可点击「重新生成」再试一次。
                </Typography.Paragraph>
              </>
            ) : (
              <>
                {listBlock('爆款共性', diagnosis.hotPatterns, '#16a34a')}
                {listBlock('低效视频归因', diagnosis.weakPatterns, '#dc2626')}
                {diagnosis.titleNotes && (
                  <Card size="small" title="标题 / 封面诊断" style={{ marginBottom: 16 }}>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      {diagnosis.titleNotes}
                    </Typography.Paragraph>
                  </Card>
                )}
                {listBlock('发布时间建议', diagnosis.advicePublishTime, '#4f6ef7')}
                {listBlock('选题方向建议', diagnosis.adviceTopics, '#4f6ef7')}
                {listBlock('行动清单', diagnosis.adviceActions, '#d97706')}
              </>
            )}
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="模型">{diagnosis.model ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="生成时间">{diagnosis.generatedAt.replace('T', ' ').slice(0, 19)}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>
    </div>
  )
}
