import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { StrategyComparison } from '../../api/types'
import { Card, Chip } from '../../design/primitives'
import { buildCompareCsv, downloadCsv } from '../../lib/csv'

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
  /** higher-is-better. null = neutral (取引数), false = lower-is-better (Max DD) */
  hb: boolean | null
}

interface CompareTableProps {
  strategies: StrategyComparison[]
  lang: Lang
}

const TH_BASE: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'var(--text2)',
  letterSpacing: '-0.005em',
  textAlign: 'right',
  padding: '14px 14px',
  borderBottom: '1px solid var(--border-strong)',
  whiteSpace: 'nowrap',
}

const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  letterSpacing: 'var(--tracking-mono)',
  textAlign: 'right',
  padding: '14px 14px',
  borderBottom: '1px solid var(--border)',
}

const TD_DELTA: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  letterSpacing: 'var(--tracking-mono)',
  textAlign: 'right',
  padding: '4px 14px 12px',
  borderBottom: '1px solid var(--border)',
}

function fmt(v: number | null | undefined, suffix: string): string {
  if (v == null) return '—'
  return `${v.toFixed(Math.abs(v) > 99 ? 0 : 2)}${suffix}`
}

function valueColor(v: number | null, hb: boolean | null): string {
  if (v == null || hb === null) return 'var(--text)'
  if (hb) {
    return v >= 0 ? 'var(--success)' : 'var(--danger)'
  }
  return v >= -25 ? 'var(--text)' : 'var(--danger)'
}

function deltaColor(delta: number | null, improved: boolean | null): string {
  if (improved === null || delta === null) return 'var(--text2)'
  return improved ? 'var(--success)' : 'var(--danger)'
}

export function CompareTable({ strategies, lang }: CompareTableProps): React.ReactElement | null {
  const L = makeL(lang)
  const baseline = strategies.find(s => s.is_baseline) ?? strategies[0]
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

  return (
    <Card pad={false} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px 0' }}>
        <button
          type="button"
          onClick={() => downloadCsv('compare.csv', buildCompareCsv(strategies))}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--text2)',
            letterSpacing: '0.05em',
          }}
        >
          CSV
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 720,
          }}
        >
          <thead style={{ background: 'var(--surface-2)' }}>
            <tr>
              <th
                style={{
                  ...TH_BASE,
                  textAlign: 'left',
                  paddingLeft: 20,
                  fontFamily: 'var(--serif)',
                }}
              >
                {L('戦略', 'Strategy')}
              </th>
              {COLS.map(c => (
                <th key={c.key} style={TH_BASE}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map((s, rowIdx) => {
              const isBase = s.is_baseline
              const zebra = rowIdx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface)'
              return (
                <Fragment key={s.id}>
                  <tr style={{ background: zebra }}>
                    <td
                      style={{
                        ...TD_BASE,
                        textAlign: 'left',
                        paddingLeft: 20,
                        borderLeft: isBase ? '2px solid var(--accent)' : '2px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {isBase && <Chip tone="accent">Base</Chip>}
                        <span
                          style={{
                            fontFamily: 'var(--serif)',
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: 'var(--text)',
                            letterSpacing: '-0.005em',
                          }}
                        >
                          {s.name}
                        </span>
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 'var(--fs-mono-sm)',
                          color: 'var(--text3)',
                          marginTop: 4,
                          letterSpacing: 'var(--tracking-mono)',
                        }}
                      >
                        {s.symbol} · {s.total_trades} {L('取引', 'trades')}
                      </div>
                    </td>
                    {COLS.map(c => {
                      const v = s[c.key] ?? null
                      return (
                        <td key={c.key} style={TD_BASE}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: valueColor(v as number | null, c.hb),
                            }}
                          >
                            {fmt(v as number | null, c.suffix)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                  {!isBase && (
                    <tr style={{ background: zebra }}>
                      <td
                        style={{
                          ...TD_DELTA,
                          textAlign: 'left',
                          paddingLeft: 20,
                          color: 'var(--text3)',
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
                          {L('vs', 'vs')} {baseline.name}
                        </span>
                      </td>
                      {COLS.map(c => {
                        const sv = (s[c.key] ?? null) as number | null
                        const bv = (baseline[c.key] ?? null) as number | null
                        const delta = sv != null && bv != null ? sv - bv : null
                        const improved =
                          delta == null || c.hb === null ? null : c.hb ? delta > 0 : delta < 0
                        const sign = delta != null && delta >= 0 ? '+' : ''
                        return (
                          <td key={c.key} style={TD_DELTA}>
                            <span style={{ color: deltaColor(delta, improved), fontWeight: 600 }}>
                              {delta == null
                                ? '—'
                                : `${sign}${delta.toFixed(Math.abs(delta) > 99 ? 0 : 2)}${c.suffix}${
                                    improved === true ? ' ↑' : improved === false ? ' ↓' : ''
                                  }`}
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
    </Card>
  )
}
