import type { ReactNode } from 'react'

interface ToolbarProps {
  /** 左端スロット（戻るボタン・breadcrumb 等） */
  leading?: ReactNode
  /** 中央のタイトル領域 */
  children?: ReactNode
  /** 右端スロット（操作群） */
  trailing?: ReactNode
  /** 上端固定 */
  sticky?: boolean
}

export function Toolbar({ leading, children, trailing, sticky = false }: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '12px 24px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: sticky ? 'sticky' : 'static',
        top: 0,
        zIndex: 5,
        flexShrink: 0,
      }}
    >
      {leading && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {children}
      </div>
      {trailing && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{trailing}</div>}
    </div>
  )
}
