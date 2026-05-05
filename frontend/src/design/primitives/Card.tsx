import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  /** padding を抑えたい場合に false。デフォルトは comfortable */
  pad?: boolean
  /** カードの強調度。subtle = 罫線なし */
  variant?: 'default' | 'subtle' | 'inset'
  style?: CSSProperties
}

const VARIANT_STYLES: Record<NonNullable<CardProps['variant']>, CSSProperties> = {
  default: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  subtle: {
    background: 'var(--surface)',
    border: 'none',
  },
  inset: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
  },
}

export function Card({ children, pad = true, variant = 'default', style }: CardProps) {
  return (
    <div
      style={{
        ...VARIANT_STYLES[variant],
        borderRadius: 'var(--radius-md)',
        padding: pad ? 'var(--space-5) var(--space-5)' : 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
