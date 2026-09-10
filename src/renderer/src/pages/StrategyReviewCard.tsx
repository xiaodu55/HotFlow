/** 看板「策略复盘」卡片：上期建议 → 本期验证（数据由 getStrategyReview 提供） */
import type { ReactNode } from 'react'
import { Alert, Card, List, Space, Tag } from 'antd'
import { AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'
import type { StrategyReview } from '@shared/types'
import { fmtTime } from '../utils'

/** 复盘结论的粗略归类图标：命中关键词即标 ✓/✗，其余中性展示（完整文本始终可见） */
function reviewMark(line: string): ReactNode {
  if (/未见执行|未执行|未按|没有执行|无效|未见效/.test(line)) {
    return <CloseCircleOutlined style={{ color: '#f87171', marginRight: 6 }} />
  }
  if (/已验证|得到验证|有效|见效|成立/.test(line)) {
    return <CheckCircleOutlined style={{ color: '#34d399', marginRight: 6 }} />
  }
  return <InfoCircleOutlined style={{ color: 'rgba(148,163,184,0.8)', marginRight: 6 }} />
}

export default function StrategyReviewCard({ review }: { review: StrategyReview | null }): ReactNode {
  if (!review?.previous) return null
  return (
    <Card
      size="small"
      title={
        <Space>
          <AuditOutlined style={{ color: '#a78bfa' }} />
          策略复盘
          {review.retrospective.length > 0 ? <Tag color="success">已复盘</Tag> : <Tag color="warning">待验证</Tag>}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.9)', marginBottom: 4 }}>
        上期建议（{fmtTime(review.previous.generatedAt)} 诊断）：
      </div>
      <List
        size="small"
        dataSource={[...review.previous.advicePublishTime, ...review.previous.adviceActions]}
        locale={{ emptyText: '上期诊断未给出结构化建议' }}
        renderItem={(item) => (
          <List.Item style={{ padding: '4px 0' }}>
            <span style={{ fontSize: 13, lineHeight: 1.7 }}>{item}</span>
          </List.Item>
        )}
      />
      {review.retrospective.length > 0 ? (
        <>
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.9)', margin: '10px 0 4px' }}>本期复盘结论：</div>
          <List
            size="small"
            dataSource={review.retrospective}
            renderItem={(line) => (
              <List.Item style={{ padding: '4px 0' }}>
                <span style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {reviewMark(line)}
                  {line}
                </span>
              </List.Item>
            )}
          />
        </>
      ) : (
        <Alert
          type="info"
          showIcon
          message="上期建议待验证：为本期数据重新生成 AI 诊断，即可自动对照复盘执行情况。"
          style={{ marginTop: 8 }}
        />
      )}
    </Card>
  )
}
