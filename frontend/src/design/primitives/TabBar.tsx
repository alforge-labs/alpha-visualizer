import type { ReactNode } from 'react'

interface TabProps {
  children: ReactNode
  active: boolean
  onClick: () => void
  /** モノ caption スタイルにする（小さなサブタブ用） */
  small?: boolean
  /** SR 用ラベル（テキスト以外を渡す場合に上書き） */
  ariaLabel?: string
}

export function Tab({ children, active, onClick, small = false, ariaLabel }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        position: 'relative',
        padding: small ? '8px 14px' : '12px 18px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: small ? 'var(--mono)' : 'var(--sans)',
        fontSize: small ? 'var(--fs-mono-sm)' : 'var(--fs-h3)',
        fontWeight: active ? 600 : 500,
        letterSpacing: small ? 'var(--tracking-caption)' : 0,
        textTransform: small ? 'uppercase' : 'none',
        color: active ? 'var(--text)' : 'var(--text3)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -1,
        transition: 'color var(--motion-fast), border-color var(--motion-fast)',
      }}
    >
      {children}
    </button>
  )
}

interface TabBarProps {
  children: ReactNode
  /** ボーダーの強調 */
  bordered?: boolean
  /** SR 用ラベル（"バックテスト詳細タブ" など） */
  ariaLabel?: string
}

export function TabBar({ children, bordered = true, ariaLabel }: TabBarProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        borderBottom: bordered ? '1px solid var(--border)' : 'none',
        marginBottom: bordered ? 'var(--space-5)' : 0,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  )
}
