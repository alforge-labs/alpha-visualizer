import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Variation } from '../../hooks/useTheme'
import type { BacktestMetrics } from '../../api/types'

type Key =
  | 'total_return_pct'
  | 'cagr_pct'
  | 'sharpe_ratio'
  | 'sortino_ratio'
  | 'max_drawdown_pct'
  | 'win_rate_pct'
  | 'profit_factor'
  | 'total_trades'

interface Row {
  key: Key
  label: string
  suffix: string
  /** higher-is-better; null = neither, false = lower-is-better */
  hb: boolean | null
}

interface Side {
  label: string
  m: BacktestMetrics
  accent: string
  bg: string
  labelColor: string
}

interface Props {
  isM: BacktestMetrics
  oosM: BacktestMetrics
  lang: Lang
  variation: Variation
}

export function ISOOSMetrics({ isM, oosM, lang, variation }: Props) {
  const L = makeL(lang)
  const ROWS: Row[] = [
    { key: 'total_return_pct', label: L('総リターン', 'Total Return'), suffix: '%', hb: true },
    { key: 'cagr_pct', label: 'CAGR', suffix: '%', hb: true },
    { key: 'sharpe_ratio', label: L('シャープ', 'Sharpe'), suffix: '', hb: true },
    { key: 'sortino_ratio', label: L('ソルティノ', 'Sortino'), suffix: '', hb: true },
    { key: 'max_drawdown_pct', label: L('最大DD', 'Max DD'), suffix: '%', hb: false },
    { key: 'win_rate_pct', label: L('勝率', 'Win Rate'), suffix: '%', hb: true },
    { key: 'profit_factor', label: 'P.Factor', suffix: '', hb: true },
    { key: 'total_trades', label: L('取引数', 'Trades'), suffix: '', hb: null },
  ]
  const sides: Side[] = [
    {
      label: L('インサンプル (IS)', 'In-Sample (IS)'),
      m: isM,
      accent: 'rgba(0,228,154,0.4)',
      bg: 'rgba(0,228,154,0.03)',
      labelColor: '#00e49a',
    },
    {
      label: L('アウトオブサンプル (OOS)', 'Out-of-Sample (OOS)'),
      m: oosM,
      accent: 'rgba(115,120,144,0.3)',
      bg: 'rgba(255,255,255,0.01)',
      labelColor: 'var(--text2)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {sides.map(({ label, m, accent, bg, labelColor }, col) => (
        <div
          key={col}
          style={{
            background: 'var(--surface)',
            border: `1px solid ${accent}`,
            borderRadius: variation === 'clarity' ? 10 : 7,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${accent}`,
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: 700,
                color: labelColor,
              }}
            >
              {label}
            </span>
            {col === 1 && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--text3)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '2px 6px',
                  borderRadius: 3,
                }}
              >
                {L('検証期間', 'OOS Period')}
              </span>
            )}
          </div>
          <div>
            {ROWS.map((row) => {
              const v = m[row.key] as number | undefined
              const isVal = isM[row.key] as number | undefined
              const oosVal = oosM[row.key] as number | undefined
              const degraded =
                col === 1 &&
                row.hb !== null &&
                typeof isVal === 'number' &&
                typeof oosVal === 'number' &&
                (row.hb ? oosVal < isVal * 0.75 : Math.abs(oosVal) > Math.abs(isVal) * 1.3)
              const vc =
                row.hb === null
                  ? 'var(--text)'
                  : degraded
                    ? '#f5a623'
                    : row.hb
                      ? typeof v === 'number' && v > 0
                        ? '#00e49a'
                        : '#ff5c5c'
                      : 'var(--text)'
              const display =
                typeof v === 'number'
                  ? Math.abs(v) >= 100
                    ? v.toFixed(1)
                    : v.toFixed(2)
                  : '—'
              return (
                <div
                  key={row.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.035)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                    {row.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {degraded && <span style={{ fontSize: 11, color: '#f5a623' }}>⚠</span>}
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 14,
                        fontWeight: 700,
                        color: vc,
                      }}
                    >
                      {display}
                      {row.suffix}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
