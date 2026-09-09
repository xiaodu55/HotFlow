import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, Result } from 'antd'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** 渲染崩溃兜底：显示友好错误页而非整窗白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('页面渲染崩溃：', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面出了点问题"
          subTitle={this.state.error.message || '渲染时发生未知错误'}
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
