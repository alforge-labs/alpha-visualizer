import type { ReactNode } from 'react'

interface KeyValueProps {
  label: string
  value: ReactNode
  /** 値の色トーン */
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'accent'
  /** 罫線で区切る一覧の途中行に使う */
  withDivider?: boolean
}

const TONE_COLOR = {
  neutral: 'var(--text)',
  positive: 'var(--success)',
  negative: 'var(--danger)',
  warning: 'var(--warn)',
  accent: 'var(--accent)',
} as const

export function KeyValue({ label, value, tone = 'neutral', withDivider = true }: KeyValueProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: withDivider ? '1px solid var(--border)' : 'none',
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
          textTransform: 'uppercase',
          color: 'var(--text3)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-h3)',
          fontWeight: 600,
          color: TONE_COLOR[tone],
        }}
      >
        {value}
      </span>
    </div>
  )
}
