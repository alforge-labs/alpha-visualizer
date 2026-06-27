import type { KeyboardEvent, ReactNode } from 'react'

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

/**
 * WAI-ARIA tabs パターンの自動アクティベーション（issue #258）。
 * 矢印 / Home / End でフォーカスを移動し、移動先タブをそのまま選択する。
 * Tab は composition で渡されるため、移動先要素に focus() + click() して
 * 親の onClick（＝選択）を発火させる。複数 tablist が同一画面にあっても
 * currentTarget 内に閉じて走査するため互いに干渉しない。
 */
function handleTablistKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
  if (!NAV_KEYS.includes(e.key)) return

  const tabs = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
  ).filter((t) => !t.hasAttribute('disabled'))
  if (tabs.length === 0) return

  const current = tabs.indexOf(document.activeElement as HTMLElement)
  if (current === -1) return

  e.preventDefault()
  let next = current
  switch (e.key) {
    case 'ArrowRight':
      next = (current + 1) % tabs.length
      break
    case 'ArrowLeft':
      next = (current - 1 + tabs.length) % tabs.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = tabs.length - 1
      break
  }

  const target = tabs[next]
  if (!target) return
  target.focus()
  target.click()
}

export function TabBar({ children, bordered = true, ariaLabel }: TabBarProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleTablistKeyDown}
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
