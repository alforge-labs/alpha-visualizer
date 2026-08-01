import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { fmtNumber } from '../../lib/format'
import {
  computeSubperiodMetrics,
  presetStartDate,
  type SubperiodPreset,
} from '../../lib/subperiod'

interface Props {
  dates: readonly string[]
  equity: readonly number[]
  returns: readonly number[]
  lang: Lang
}

type Selection = 'full' | SubperiodPreset

const PRESETS: ReadonlyArray<readonly [SubperiodPreset, string]> = [
  ['ytd', 'YTD'],
  ['1y', '1Y'],
  ['3y', '3Y'],
  ['5y', '5Y'],
]

/**
 * 期間プリセットによるサブピリオド指標（issue #377）。
 *
 * 全期間の指標グリッドとは別に、選択期間の日次リターン・equity から
 * 主要指標をフロント側で再計算して表示する。数十年スパンの run で
 * 「直近の実力」を確認するための機能。
 */
export function SubperiodMetrics({ dates, equity, returns, lang }: Props): ReactElement | null {
  const L = makeL(lang)
  const [selection, setSelection] = useState<Selection>('full')

  const lastDate = dates[dates.length - 1]

  const computed = useMemo(() => {
    if (selection === 'full' || !lastDate) return null
    return computeSubperiodMetrics({
      dates,
      equity,
      returns,
      fromDate: presetStartDate(selection, lastDate),
    })
  }, [selection, dates, equity, returns, lastDate])

  if (!lastDate) return null

  const chipS = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    background: active ? 'var(--accent-bg)' : 'transparent',
    border: `1px solid ${active ? 'var(--accent-glow)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-pill)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-mono-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  })

  const items: ReadonlyArray<readonly [string, string, string]> | null = computed
    ? [
        [
          L('リターン', 'Return'),
          fmtNumber(computed.totalReturnPct, { decimals: 1, suffix: '%', sign: true }),
          computed.totalReturnPct >= 0 ? 'var(--success)' : 'var(--danger)',
        ],
        ['Sharpe', fmtNumber(computed.sharpe, { decimals: 2 }), 'var(--text)'],
        [
          L('最大DD', 'Max DD'),
          fmtNumber(computed.maxDrawdownPct, { decimals: 1, suffix: '%' }),
          'var(--danger)',
        ],
        [
          L('年率ボラ', 'Volatility'),
          fmtNumber(computed.volatilityPct, { decimals: 1, suffix: '%' }),
          'var(--text)',
        ],
      ]
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        role="group"
        aria-label={L('指標の集計期間', 'Metrics period')}
        style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
      >
        <button
          type="button"
          aria-pressed={selection === 'full'}
          style={chipS(selection === 'full')}
          onClick={() => setSelection('full')}
        >
          {L('全期間', 'Full period')}
        </button>
        {PRESETS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={selection === value}
            style={chipS(selection === value)}
            onClick={() => setSelection(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {selection !== 'full' && computed && items && (
        <div
          data-testid="subperiod-metrics"
          style={{
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {items.map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                {label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color,
                }}
              >
                {value}
              </span>
            </div>
          ))}
          <span
            style={{
              alignSelf: 'flex-end',
              marginLeft: 'auto',
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text3)',
            }}
          >
            {L(
              `${computed.startDate} 〜（${computed.days} 日）・日次リターンから再計算。取引ベースの指標（勝率・PF 等）は対象外`,
              `${computed.startDate} – (${computed.days} days) · recomputed from daily returns. Trade-based metrics (win rate, PF, …) are not included`,
            )}
          </span>
        </div>
      )}
      {selection !== 'full' && !computed && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          {L('選択期間にデータがありません', 'No data in the selected period')}
        </p>
      )}
    </div>
  )
}
