import { useEffect, useMemo, useState } from 'react'
import { App, Button, Card, Empty, Input, List, Popconfirm, Segmented, Space, Tag, Typography } from 'antd'
import { CheckOutlined, CloseOutlined, DeleteOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons'
import type { Topic, TopicStatus } from '@shared/types'
import PageHeader from '../components/PageHeader'

const STATUS_META: Record<TopicStatus, { label: string; color: string }> = {
  open: { label: '待执行', color: 'gold' },
  published: { label: '已发布', color: 'success' },
  dropped: { label: '已放弃', color: 'default' }
}

export default function TopicsPage() {
  const { message } = App.useApp()
  const [topics, setTopics] = useState<Topic[]>([])
  const [filter, setFilter] = useState<'all' | TopicStatus>('all')
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void window.api
      .listTopics()
      .then(setTopics)
      .catch(() => message.error('选题加载失败'))
  }, [message])

  const shown = useMemo(() => (filter === 'all' ? topics : topics.filter((t) => t.status === filter)), [topics, filter])

  async function add() {
    const text = draft.trim()
    if (!text) return
    setAdding(true)
    try {
      const before = topics.length
      setTopics(await window.api.addTopic(text, 'manual'))
      if (topics.some((t) => t.text === text)) message.info('该选题已在库中')
      else message.success(`已加入选题库（${before + 1} 条）`)
      setDraft('')
    } catch (err) {
      message.error(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAdding(false)
    }
  }

  async function setStatus(id: string, status: TopicStatus) {
    try {
      setTopics(await window.api.updateTopic(id, status))
    } catch {
      message.error('状态更新失败')
    }
  }

  async function remove(id: string) {
    try {
      setTopics(await window.api.deleteTopic(id))
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <PageHeader
        title="选题库"
        description="AI 诊断的选题建议与手动记录都在这里跟踪执行：待执行 → 已发布 / 已放弃"
      />

      <Card style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="记录一个选题想法，回车或点击添加"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={() => void add()}
            allowClear
          />
          <Button type="primary" icon={<SendOutlined />} loading={adding} onClick={() => void add()}>
            添加
          </Button>
        </Space.Compact>
      </Card>

      <Card styles={{ body: { paddingTop: 12 } }}>
        <Segmented
          style={{ marginBottom: 12 }}
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: 'all', label: `全部 ${topics.length}` },
            { value: 'open', label: `待执行 ${topics.filter((t) => t.status === 'open').length}` },
            { value: 'published', label: `已发布 ${topics.filter((t) => t.status === 'published').length}` },
            { value: 'dropped', label: `已放弃 ${topics.filter((t) => t.status === 'dropped').length}` }
          ]}
        />
        {shown.length === 0 ? (
          <Empty
            description={
              filter === 'all'
                ? '还没有选题——在「AI 诊断」页可把建议一键加入选题库'
                : '该状态下暂无选题'
            }
            style={{ padding: '24px 0' }}
          />
        ) : (
          <List<Topic>
            dataSource={shown}
            renderItem={(t) => (
              <List.Item
                actions={
                  t.status === 'open'
                    ? [
                        <Button
                          key="pub"
                          type="link"
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={() => void setStatus(t.id, 'published')}
                        >
                          标记已发布
                        </Button>,
                        <Button
                          key="drop"
                          type="link"
                          size="small"
                          icon={<CloseOutlined />}
                          onClick={() => void setStatus(t.id, 'dropped')}
                        >
                          放弃
                        </Button>,
                        <Popconfirm key="del" title="删除这条选题？" onConfirm={() => void remove(t.id)}>
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ]
                    : [
                        <Button
                          key="reopen"
                          type="link"
                          size="small"
                          icon={<UndoOutlined />}
                          onClick={() => void setStatus(t.id, 'open')}
                        >
                          恢复待执行
                        </Button>,
                        <Popconfirm key="del" title="删除这条选题？" onConfirm={() => void remove(t.id)}>
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ]
                }
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6} wrap style={{ marginBottom: 2 }}>
                    <Tag color={STATUS_META[t.status].color} bordered={false}>
                      {STATUS_META[t.status].label}
                    </Tag>
                    {t.source === 'ai' && (
                      <Tag color="purple" bordered={false}>
                        AI 建议
                      </Tag>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t.createdAt.replace('T', ' ').slice(0, 16)}
                    </Typography.Text>
                  </Space>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{t.text}</div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  )
}
