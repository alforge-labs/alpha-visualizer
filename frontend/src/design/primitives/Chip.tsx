import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'

const TONE_FG: Record<Tone, string> = {
  neutral: 'var(--text2)',
  accent: 'var(--accent)',
  positive: 'var(--success)',
  negative: 'var(--danger)',
  warning: 'var(--warn)',
}

const TONE_BG: Record<Tone, string> = {
  neutral: 'var(--surface-2)',
  accent: 'var(--accent-bg)',
  positive: 'color-mix(in srgb, var(--success) 12%, transparent)',
  negative: 'color-mix(in srgb, var(--danger) 12%, transparent)',
  warning: 'color-mix(in srgb, var(--warn) 12%, transparent)',
}

const TONE_BORDER: Record<Tone, string> = {
  neutral: 'var(--border)',
  accent: 'var(--accent-glow)',
  positive: 'color-mix(in srgb, var(--success) 28%, transparent)',
  negative: 'color-mix(in srgb, var(--danger) 28%, transparent)',
  warning: 'color-mix(in srgb, var(--warn) 28%, transparent)',
}

interface ChipProps {
  children: ReactNode
  tone?: Tone
}

export function Chip({ children, tone = 'neutral' }: ChipProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        background: TONE_BG[tone],
        border: `1px solid ${TONE_BORDER[tone]}`,
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        fontWeight: 600,
        color: TONE_FG[tone],
        letterSpacing: 'var(--tracking-mono)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
