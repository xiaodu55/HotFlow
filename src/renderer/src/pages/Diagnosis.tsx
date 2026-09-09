import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, App, Button, Card, Descriptions, Empty, Input, List, Result, Space, Spin, Typography } from 'antd'
import { RobotOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { AppSettings, DiagnosisResult } from '@shared/types'
import PageHeader from '../components/PageHeader'
import type { PageKey } from '../App'

interface Props {
  currentId: string | null
  diagnosis: DiagnosisResult | null
  onDiagnosis: (d: DiagnosisResult) => void
  settings: AppSettings | null
  onNavigate: (page: PageKey) => void
  compareId: string | undefined
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
  onNavigate,
  compareId
}: Props) {
  const { message } = App.useApp()
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [question, setQuestion] = useState('')

  const llmReady = Boolean(
    settings && settings.llm.apiKey.trim() && settings.llm.baseURL.trim() && settings.llm.model.trim()
  )

  useEffect(() => window.api.onLlmChunk((text) => setStreamText((prev) => prev + text)), [])

  async function run() {
    if (!currentId) return
    setStreaming(true)
    setStreamText('')
    try {
      const d = await window.api.runDiagnosis(currentId, compareId)
      onDiagnosis(d)
      message.success('AI 诊断完成')
    } catch (err) {
      message.error(`诊断失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStreaming(false)
    }
  }

  async function ask() {
    const q = question.trim()
    if (!q || !currentId || !diagnosis) return
    setQuestion('')
    setStreaming(true)
    setStreamText('')
    try {
      const d = await window.api.askDiagnosis(currentId, q)
      onDiagnosis(d)
    } catch (err) {
      message.error(`追问失败：${err instanceof Error ? err.message : String(err)}`)
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

  const conversation = diagnosis?.conversation ?? []

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="AI 内容诊断" description="基于当前数据与所选对比期生成诊断；生成后可继续追问" />

      <Card
        title={
          <Space>
            <RobotOutlined />
            诊断报告
          </Space>
        }
        extra={
          <Button type="primary" icon={<ThunderboltOutlined />} loading={streaming} onClick={run}>
            {diagnosis ? '重新生成' : '生成诊断'}
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {!diagnosis && !streaming && (
          <Typography.Paragraph type="secondary">
            基于当前数据的整体指标、趋势、时段表现和 Top/Bottom 视频明细，
            由大模型给出爆款共性、低效归因和可执行的运营建议。首次生成约需 10~60 秒。
          </Typography.Paragraph>
        )}

        {streaming && (
          <>
            <Alert type="info" showIcon message="模型输出中…" style={{ marginBottom: 12 }} />
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
                {listBlock('爆款共性', diagnosis.hotPatterns, '#34d399')}
                {listBlock('低效视频归因', diagnosis.weakPatterns, '#f87171')}
                {diagnosis.titleNotes && (
                  <Card size="small" title="标题 / 封面诊断" style={{ marginBottom: 16 }}>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>{diagnosis.titleNotes}</Typography.Paragraph>
                  </Card>
                )}
                {listBlock('发布时间建议', diagnosis.advicePublishTime, '#22d3ee')}
                {listBlock('选题方向建议', diagnosis.adviceTopics, '#22d3ee')}
                {listBlock('行动清单', diagnosis.adviceActions, '#fbbf24')}
              </>
            )}
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="模型">{diagnosis.model ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="生成时间">
                {diagnosis.generatedAt.replace('T', ' ').slice(0, 19)}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>

      {diagnosis && !diagnosis.rawText && (
        <Card title="追问" styles={{ body: { paddingTop: 16 } }}>
          {conversation.map((turn, i) => (
            <div className="qa-block" key={i}>
              <div className="qa-question">Q：{turn.question}</div>
              <div className="qa-answer">{turn.answer}</div>
            </div>
          ))}
          {streaming && <div className="stream-box">{streamText || '思考中…'}</div>}
          <Space.Compact style={{ width: '100%', marginTop: 12 }}>
            <Input
              placeholder="例如：为什么 19 点发布的视频效果最好？下期选题有什么建议？"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onPressEnter={() => void ask()}
              disabled={streaming}
            />
            <Button type="primary" icon={<SendOutlined />} loading={streaming} onClick={() => void ask()}>
              发送
            </Button>
          </Space.Compact>
          {conversation.length > 0 && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
              追问记录会随诊断一起保存在本机。
            </Typography.Paragraph>
          )}
        </Card>
      )}
    </div>
  )
}
