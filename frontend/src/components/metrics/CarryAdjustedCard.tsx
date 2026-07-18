import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { CarryAdjusted } from '../../api/types'

interface Props {
  carry: CarryAdjusted
  lang: Lang
}

function fmt(value: number | null | undefined, suffix = ''): string {
  if (value == null) return '—'
  return `${value.toFixed(2)}${suffix}`
}

/**
 * FX キャリー（金利差近似）込みの参考メトリクス（vis#308）。
 * forge `backtest run --carry` が保存した carry_adjusted を price-only と
 * 対比できるよう表示する。キャリー計上のないランでは親側で描画しない。
 */
export function CarryAdjustedCard({ carry, lang }: Props) {
  const L = makeL(lang)
  const m = carry.metrics ?? {}
  const items: ReadonlyArray<readonly [string, string]> = [
    [L('総リターン', 'Total Return'), fmt(m.total_return_pct, '%')],
    ['CAGR', fmt(m.cagr_pct, '%')],
    [L('最大DD', 'Max DD'), fmt(m.max_drawdown_pct, '%')],
    [L('シャープ', 'Sharpe'), fmt(m.sharpe_ratio)],
    [L('ボラティリティ', 'Volatility'), fmt(m.volatility_pct, '%')],
  ]

  return (
    <div
      data-testid="carry-adjusted-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
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
        {L('キャリー近似（金利差）', 'Carry Approximation (Rate Differential)')}
      </span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 12,
        }}
      >
        {items.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-caption)',
                color: 'var(--text3)',
              }}
            >
              {label}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-md)',
                fontWeight: 700,
                letterSpacing: 'var(--tracking-mono)',
                color: 'var(--text1)',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      {carry.note && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          {carry.note}
        </p>
      )}
    </div>
  )
}
