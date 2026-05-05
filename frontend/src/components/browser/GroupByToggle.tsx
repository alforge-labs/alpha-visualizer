import type { GroupBy } from '../../hooks/useStrategyList'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

interface Props {
  groupBy: GroupBy
  onChange: (g: GroupBy) => void
  lang: Lang
}

const CAPTION: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

export function GroupByToggle({ groupBy, onChange, lang }: Props) {
  const L = makeL(lang)
  const options: ReadonlyArray<readonly [GroupBy, string]> = [
    ['none', L('なし', 'None')],
    ['symbol', L('銘柄', 'Symbol')],
    ['tf', L('時間軸', 'Timeframe')],
    ['tier', L('Sharpe階級', 'Sharpe Tier')],
  ]

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={CAPTION}>{L('グループ', 'Group by')}</span>
      <div
        role="radiogroup"
        aria-label={L('グルーピング', 'Group by')}
        style={{
          display: 'inline-flex',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          padding: 2,
          gap: 2,
        }}
      >
        {options.map(([value, label]) => {
          const active = value === groupBy
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${L('グループ', 'Group by')}: ${label}`}
              onClick={() => onChange(value)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--surface)' : 'var(--text2)',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                fontWeight: 600,
                letterSpacing: 'var(--tracking-mono)',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background var(--motion-fast), color var(--motion-fast)',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
