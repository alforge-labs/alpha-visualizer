import type { ReactNode } from 'react'

interface SecHeadProps {
  title: string
  subtitle?: string
  right?: ReactNode
}

export function SecHead({ title, subtitle, right }: SecHeadProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingBottom: 14,
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <div>
        <h2
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--text3)',
              margin: '4px 0 0',
              letterSpacing: '0.06em',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  )
}

interface PillProps {
  children: ReactNode
  active: boolean
  onClick: () => void
}

export function Pill({ children, active, onClick }: PillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--sans)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent)' : 'var(--text2)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'color 0.12s',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--text3)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}
