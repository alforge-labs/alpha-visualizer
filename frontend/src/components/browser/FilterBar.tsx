import { useSearchParams } from 'react-router-dom'
import { makeL } from '../../i18n/strings'
import type { Lang } from '../../i18n/strings'
import { Toolbar } from '../../design/primitives'

interface Props {
  symbols: string[]
  timeframes: string[]
  lang: Lang
}

const NUMERIC_INPUT: React.CSSProperties = {
  width: 64,
  padding: '6px 8px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  letterSpacing: 'var(--tracking-mono)',
}

const SEARCH_INPUT: React.CSSProperties = {
  width: 240,
  padding: '8px 12px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text)',
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-body)',
}

const CAPTION: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

interface FilterChipButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function FilterChipButton({ active, onClick, children }: FilterChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        background: active ? 'var(--accent-bg)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent-glow)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-pill)',
        color: active ? 'var(--accent)' : 'var(--text2)',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        fontWeight: 600,
        letterSpacing: 'var(--tracking-mono)',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast)',
      }}
    >
      {children}
    </button>
  )
}

export function FilterBar({ symbols, timeframes, lang }: Props) {
  const L = makeL(lang)
  const [searchParams, setSearchParams] = useSearchParams()

  const set = (key: string, value: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  const toggle = (key: string, value: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const current = next.get(key)?.split(',').filter(Boolean) ?? []
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      if (updated.length) next.set(key, updated.join(','))
      else next.delete(key)
      return next
    }, { replace: true })
  }

  const clearAll = (): void => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const q = searchParams.get('q') ?? ''
  const symbolFilter = searchParams.get('symbol')?.split(',').filter(Boolean) ?? []
  const tfFilter = searchParams.get('tf')?.split(',').filter(Boolean) ?? []
  const sharpeMin = searchParams.get('sharpe_min') ?? ''
  const ddMax = searchParams.get('dd_max') ?? ''

  const hasFilters = q || symbolFilter.length > 0 || tfFilter.length > 0 || sharpeMin || ddMax

  return (
    <Toolbar sticky>
      <input
        style={SEARCH_INPUT}
        placeholder={L('戦略名・銘柄を検索…', 'Search strategy or symbol…')}
        value={q}
        onChange={(e) => set('q', e.target.value)}
      />

      {symbols.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={CAPTION}>{L('銘柄', 'Symbol')}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {symbols.map(s => (
              <FilterChipButton
                key={s}
                active={symbolFilter.includes(s)}
                onClick={() => toggle('symbol', s)}
              >
                {s}
              </FilterChipButton>
            ))}
          </div>
        </div>
      )}

      {timeframes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={CAPTION}>{L('時間軸', 'TF')}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {timeframes.map(tf => (
              <FilterChipButton
                key={tf}
                active={tfFilter.includes(tf)}
                onClick={() => toggle('tf', tf)}
              >
                {tf}
              </FilterChipButton>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={CAPTION}>Sharpe ≥</span>
        <input
          style={NUMERIC_INPUT}
          type="number"
          step="0.1"
          min="0"
          value={sharpeMin}
          placeholder="1.0"
          onChange={(e) => set('sharpe_min', e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={CAPTION}>{L('DD ≤ %', 'DD ≤ %')}</span>
        <input
          style={NUMERIC_INPUT}
          type="number"
          step="1"
          min="0"
          max="100"
          value={ddMax}
          placeholder="30"
          onChange={(e) => set('dd_max', e.target.value)}
        />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: 'var(--accent)',
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            fontWeight: 600,
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {L('フィルタを解除', 'Clear filters')}
        </button>
      )}
    </Toolbar>
  )
}
