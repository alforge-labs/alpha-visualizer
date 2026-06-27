import type { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  active: boolean
  onClick: () => void
}

/** 既存の Pill 互換。caption スタイルのトグル */
export function Pill({ children, active, onClick }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        padding: '8px 16px',
        background: active ? 'var(--accent-bg)' : 'transparent',
        border: active ? '1px solid var(--accent-glow)' : '1px solid transparent',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        fontFamily: 'var(--sans)',
        fontSize: 'var(--fs-h3)',
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--accent)' : 'var(--text2)',
        transition: 'color var(--motion-fast), background var(--motion-fast), border-color var(--motion-fast)',
      }}
    >
      {children}
    </button>
  )
}
