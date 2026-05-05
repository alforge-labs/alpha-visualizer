import type { CSSProperties, ReactNode } from 'react'

type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent'

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--text)',
  positive: 'var(--success)',
  negative: 'var(--danger)',
  warning: 'var(--warn)',
  accent: 'var(--accent)',
}

interface StatProps {
  label: string
  value: ReactNode
  /** 値の下に出す注釈 */
  sub?: ReactNode
  tone?: Tone
  /** hero 用に大きく表示 */
  size?: 'md' | 'lg' | 'xl'
  /** 値の右寄せ */
  align?: 'left' | 'right'
  style?: CSSProperties
}

const VALUE_FONT_SIZE: Record<NonNullable<StatProps['size']>, string> = {
  md: '1.05rem',
  lg: '1.5rem',
  xl: '2rem',
}

const VALUE_FONT_FAMILY: Record<NonNullable<StatProps['size']>, string> = {
  md: 'var(--mono)',
  lg: 'var(--serif)',
  xl: 'var(--serif)',
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  size = 'md',
  align = 'left',
  style,
}: StatProps) {
  const valueText = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const subText = typeof sub === 'string' || typeof sub === 'number' ? String(sub) : ''
  const ariaLabel = valueText
    ? subText
      ? `${label}: ${valueText} (${subText})`
      : `${label}: ${valueText}`
    : undefined
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: size === 'md' ? 4 : 6,
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 500,
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: VALUE_FONT_FAMILY[size],
          fontSize: VALUE_FONT_SIZE[size],
          fontWeight: size === 'md' ? 500 : 600,
          color: TONE_COLOR[tone],
          letterSpacing: size === 'md' ? 0 : 'var(--tracking-display)',
          lineHeight: 1.05,
        }}
      >
        {value}
      </span>
      {sub != null && (
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
          }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}
