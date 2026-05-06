import type { RegimeBreakdown, RegimeSeries } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { useChartTheme } from '../../design/useChartTheme'

interface RegimeBreakdownCardsProps {
  breakdown: RegimeBreakdown
  series?: RegimeSeries
  lang: Lang
}

function resolveStateIndex(label: string, series: RegimeSeries | undefined, fallback: number): number {
  if (!series?.label_names) return fallback
  for (const [stateKey, mappedLabel] of Object.entries(series.label_names)) {
    if (mappedLabel === label) {
      const n = Number(stateKey)
      if (!Number.isNaN(n)) return n
    }
  }
  return fallback
}

function colorForState(state: number, n: number, palette: readonly string[]): string {
  const c = palette[state]
  if (state >= 0 && state < palette.length && c) return c
  const safeN = Math.max(n, 1)
  return `hsl(${(state * 360) / safeN}, 55%, 55%)`
}

function formatNumber(value: number, suffix = ''): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const fixed = abs >= 100 ? value.toFixed(1) : abs >= 10 ? value.toFixed(2) : value.toFixed(3)
  return `${fixed}${suffix}`
}

interface AggregateRowProps {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'neutral'
}

function AggregateRow({ label, value, tone = 'neutral' }: AggregateRowProps) {
  const color =
    tone === 'good' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : 'var(--text)'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '0.95rem',
          fontWeight: 500,
          color,
        }}
      >
        {value}
      </span>
    </div>
  )
}

export function RegimeBreakdownCards({ breakdown, series, lang }: RegimeBreakdownCardsProps) {
  const L = makeL(lang)
  const theme = useChartTheme()
  const labels = Object.keys(breakdown.aggregates).sort()
  const nStates = series?.n_states ?? labels.length

  return (
    <div
      data-testid="regime-breakdown"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 600,
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
        }}
      >
        {L('レジーム別パフォーマンス', 'Regime Performance')}
        {breakdown.description && (
          <span
            style={{
              marginLeft: 8,
              fontWeight: 400,
              textTransform: 'none',
              color: 'var(--text3)',
              letterSpacing: 0,
            }}
          >
            ({breakdown.description})
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {labels.map((label, i) => {
          const agg = breakdown.aggregates[label]
          if (!agg) return null
          const stateIdx = resolveStateIndex(label, series, i)
          const swatch = colorForState(stateIdx, nStates, theme.series)
          const sharpeTone: AggregateRowProps['tone'] =
            agg.sharpe_avg >= 1 ? 'good' : agg.sharpe_avg < 0 ? 'bad' : 'neutral'
          const winRateTone: AggregateRowProps['tone'] =
            agg.win_rate_avg >= 50 ? 'good' : 'neutral'
          return (
            <div
              key={label}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: swatch,
                    opacity: 0.8,
                    display: 'inline-block',
                  }}
                  aria-hidden
                />
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  {label}
                </span>
              </div>
              <AggregateRow
                label={L('シャープ平均', 'Sharpe avg')}
                value={formatNumber(agg.sharpe_avg)}
                tone={sharpeTone}
              />
              <AggregateRow
                label={L('勝率平均', 'Win Rate avg')}
                value={formatNumber(agg.win_rate_avg, '%')}
                tone={winRateTone}
              />
              <AggregateRow
                label={L('総取引数', 'Total Trades')}
                value={String(agg.trades_total)}
              />
              <AggregateRow
                label={L('最大DD平均', 'Max DD avg')}
                value={formatNumber(agg.max_drawdown_avg, '%')}
                tone={agg.max_drawdown_avg <= -10 ? 'bad' : 'neutral'}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
