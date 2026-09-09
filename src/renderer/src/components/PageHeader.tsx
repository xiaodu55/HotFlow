import type { ReactNode } from 'react'

interface Props {
  title: ReactNode
  description?: ReactNode
  extra?: ReactNode
}

/** 统一页头：标题 + 描述 + 右侧操作区 */
export default function PageHeader({ title, description, extra }: Props) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        <h2 className="page-title">{title}</h2>
        {description ? <div className="page-desc">{description}</div> : null}
      </div>
      {extra ? <div className="page-extra">{extra}</div> : null}
    </div>
  )
}
