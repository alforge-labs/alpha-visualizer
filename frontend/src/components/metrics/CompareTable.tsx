import { Fragment } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { StrategyComparison } from '../../api/types'

type CompareKey =
  | 'total_return_pct'
  | 'cagr_pct'
  | 'sharpe_ratio'
  | 'sortino_ratio'
  | 'max_drawdown_pct'
  | 'win_rate_pct'
  | 'profit_factor'
  | 'total_trades'

interface CompareCol {
  key: CompareKey
  label: string
  suffix: string
  /**
   * higher-is-better. null means neither (e.g. trade count).
   * false means lower-is-better (max drawdown).
   */
  hb: boolean | null
}

interface CompareTableProps {
  strategies: StrategyComparison[]
  lang: Lang
}

export function CompareTable({ strategies, lang }: CompareTableProps) {
  const L = makeL(lang)
  const baseline = strategies.find((s) => s.is_baseline) ?? strategies[0]
  if (!baseline) return null

  const COLS: CompareCol[] = [
    { key: 'total_return_pct', label: L('総リターン', 'Total Ret'), suffix: '%', hb: true },
    { key: 'cagr_pct', label: 'CAGR', suffix: '%', hb: true },
    { key: 'sharpe_ratio', label: L('シャープ', 'Sharpe'), suffix: '', hb: true },
    { key: 'sortino_ratio', label: L('ソルティノ', 'Sortino'), suffix: '', hb: true },
    { key: 'max_drawdown_pct', label: L('最大DD', 'Max DD'), suffix: '%', hb: false },
    { key: 'win_rate_pct', label: L('勝率', 'Win Rate'), suffix: '%', hb: true },
    { key: 'profit_factor', label: 'P.Factor', suffix: '', hb: true },
    { key: 'total_trades', label: L('取引数', 'Trades'), suffix: '', hb: null },
  ]

  const th: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text3)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '8px 12px',
    textAlign: 'right',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  const td = (base: boolean): React.CSSProperties => ({
    padding: '11px 12px',
    textAlign: 'right',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    background: base ? 'rgba(0,228,154,0.025)' : 'transparent',
  })

  const fmt = (v: number, suffix: string) => `${v.toFixed(v > 99 ? 0 : 2)}${suffix}`

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', paddingLeft: 16 }}>
              {L('戦略', 'Strategy')}
            </th>
            {COLS.map((c) => (
              <th key={c.key} style={th}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => {
            const isBase = s.is_baseline
            return (
              <Fragment key={s.id}>
                <tr>
                  <td style={{ ...td(isBase), textAlign: 'left', paddingLeft: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isBase && (
                        <span
                          style={{
                            background: 'var(--accent-bg)',
                            border: '1px solid var(--accent-glow)',
                            borderRadius: 3,
                            padding: '1px 6px',
                            fontFamily: 'var(--mono)',
                            fontSize: 11,
                            color: '#00e49a',
                          }}
                        >
                          BASE
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--sans)',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text)',
                        }}
                      >
                        {s.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--text3)',
                        marginTop: 2,
                      }}
                    >
                      {s.symbol} · {s.total_trades} {L('取引', 'trades')}
                    </div>
                  </td>
                  {COLS.map((c) => {
                    const v = s[c.key]
                    const color =
                      c.hb === null
                        ? 'var(--text)'
                        : c.hb
                          ? v >= 0
                            ? '#00e49a'
                            : '#ff5c5c'
                          : v >= -25
                            ? 'var(--text)'
                            : '#ff5c5c'
                    return (
                      <td key={c.key} style={td(isBase)}>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 13,
                            fontWeight: 700,
                            color,
                          }}
                        >
                          {fmt(v, c.suffix)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
                {!isBase && (
                  <tr>
                    <td
                      style={{
                        padding: '3px 16px 9px',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: 'var(--text3)',
                        }}
                      >
                        ↳ vs {baseline.name}
                      </span>
                    </td>
                    {COLS.map((c) => {
                      const delta = s[c.key] - baseline[c.key]
                      const imp = c.hb === null ? null : c.hb ? delta > 0 : delta < 0
                      const dc = imp === true ? '#00e49a' : imp === false ? '#ff5c5c' : 'var(--text2)'
                      const sign = delta >= 0 ? '+' : ''
                      return (
                        <td
                          key={c.key}
                          style={{
                            padding: '3px 12px 9px',
                            textAlign: 'right',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 11,
                              color: dc,
                            }}
                          >
                            {sign}
                            {delta.toFixed(Math.abs(delta) > 99 ? 0 : 2)}
                            {c.suffix}
                            {imp === true ? ' ↑' : imp === false ? ' ↓' : ''}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
