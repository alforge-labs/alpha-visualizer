import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { buildAnnualSummary } from '../../lib/annualSummary'
import { fmtNumber } from '../../lib/format'

interface Props {
  annualReturns: Record<string, number>
  benchmarkReturns?: Record<string, number> | null
  annualMaxDrawdown?: Record<string, number> | null
  trades?: readonly Trade[]
  lang: Lang
}

const TH: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  fontWeight: 600,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-mono)',
  textTransform: 'uppercase',
  padding: '7px 10px',
  borderBottom: '1px solid var(--border)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const TD: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 14,
  padding: '7px 10px',
  borderBottom: '1px solid var(--border)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

/**
 * 年別サマリテーブル（issue #383）。
 *
 * 年次バーだけでは正確な値の比較・ワースト年の特定がしにくいため、
 * AnnualReturnsBar の下に数表を常設する（Portfolio Visualizer の
 * Annual Returns テーブル相当）。
 */
export function AnnualSummaryTable({
  annualReturns,
  benchmarkReturns,
  annualMaxDrawdown,
  trades,
  lang,
}: Props): ReactElement | null {
  const L = makeL(lang)
  const rows = buildAnnualSummary({
    annualReturns,
    benchmarkReturns,
    annualMaxDrawdown,
    trades,
  })
  if (rows.length === 0) return null

  const signColor = (v: number | null): string =>
    v == null ? 'var(--text3)' : v >= 0 ? 'var(--success)' : 'var(--danger)'
  const dash = '—'
  const pct = (v: number | null, sign = false): string =>
    v == null ? dash : fmtNumber(v, { decimals: 1, suffix: '%', sign })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        aria-label={L('年別サマリ', 'Annual summary')}
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}
      >
        <thead>
          <tr>
            <th scope="col" style={{ ...TH, textAlign: 'left' }}>
              {L('年', 'Year')}
            </th>
            <th scope="col" style={TH}>
              {L('リターン', 'Return')}
            </th>
            <th scope="col" style={TH}>
              {L('ベンチ', 'Bench')}
            </th>
            <th scope="col" style={TH}>
              {L('超過', 'Excess')}
            </th>
            <th scope="col" style={TH}>Max DD</th>
            <th scope="col" style={TH}>
              {L('取引数', 'Trades')}
            </th>
            <th scope="col" style={TH}>
              {L('勝率', 'Win rate')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.year} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
              <td style={{ ...TD, textAlign: 'left', color: 'var(--text)' }}>{r.year}</td>
              <td style={{ ...TD, color: signColor(r.returnPct), fontWeight: 600 }}>
                {pct(r.returnPct, true)}
              </td>
              <td style={{ ...TD, color: 'var(--text2)' }}>{pct(r.benchReturnPct, true)}</td>
              <td style={{ ...TD, color: signColor(r.excessPct) }}>{pct(r.excessPct, true)}</td>
              <td style={{ ...TD, color: r.maxDdPct == null ? 'var(--text3)' : 'var(--danger)' }}>
                {pct(r.maxDdPct)}
              </td>
              <td style={{ ...TD, color: 'var(--text2)' }}>{r.tradeCount}</td>
              <td style={{ ...TD, color: 'var(--text2)' }}>
                {r.winRatePct == null ? dash : fmtNumber(r.winRatePct, { decimals: 1, suffix: '%' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
