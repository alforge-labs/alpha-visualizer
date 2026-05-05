import type { SymbolStat } from '../../hooks/useSymbolStats'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

interface Props {
  stat: SymbolStat
  selected: boolean
  disabled: boolean
  onClick: (symbol: string) => void
  lang: Lang
}

function sharpeTone(v: number | null): string {
  if (v == null) return 'var(--text3)'
  if (v >= 1.5) return 'var(--success)'
  if (v >= 1.0) return 'var(--warn)'
  return 'var(--danger)'
}

function returnTone(v: number | null): string {
  if (v == null) return 'var(--text3)'
  return v >= 0 ? 'var(--success)' : 'var(--danger)'
}

function fmtNumber(v: number | null, suffix = '', decimals = 2): string {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}${suffix}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return s.slice(0, 10)
}

export function SymbolCard({ stat, selected, disabled, onClick, lang }: Props) {
  const L = makeL(lang)
  const isUnassigned = stat.symbol == null
  const label = isUnassigned ? L('未割当', 'Unassigned') : stat.symbol!

  const handleClick = (): void => {
    if (disabled || isUnassigned) return
    onClick(stat.symbol!)
  }

  return (
    <button
      type="button"
      role="button"
      aria-pressed={selected}
      aria-disabled={disabled || isUnassigned}
      disabled={disabled || isUnassigned}
      onClick={handleClick}
      style={{
        textAlign: 'left',
        padding: 'var(--space-4)',
        background: selected ? 'var(--accent-bg)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent-glow, var(--accent))' : 'var(--border)'}`,
        borderLeft: selected ? '3px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        cursor: disabled || isUnassigned ? 'default' : 'pointer',
        opacity: disabled && !selected ? 0.55 : 1,
        transition: 'background var(--motion-fast), border-color var(--motion-fast), transform var(--motion-fast)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minHeight: 132,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isUnassigned && !selected) {
          e.currentTarget.style.background = 'var(--surface-2)'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--surface)'
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontSize: '1.0625rem',
            fontWeight: 600,
            color: isUnassigned ? 'var(--text3)' : 'var(--text)',
            letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={label}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {L(`${stat.count}件`, `n=${stat.count}`)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-caption)',
              textTransform: 'uppercase',
            }}
          >
            {L('最高 Sharpe', 'Best Sharpe')}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '1.125rem',
              fontWeight: 700,
              color: sharpeTone(stat.bestSharpe),
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {fmtNumber(stat.bestSharpe, '', 2)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-caption)',
              textTransform: 'uppercase',
            }}
          >
            {L('平均 Return', 'Avg return')}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '1.125rem',
              fontWeight: 700,
              color: returnTone(stat.avgReturnPct),
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {fmtNumber(stat.avgReturnPct, '%', 1)}
          </span>
        </div>
      </div>

      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-mono)',
          textTransform: 'uppercase',
        }}
      >
        {L('最終実行', 'Last run')}: {fmtDate(stat.lastRunAt)}
      </div>
    </button>
  )
}
