import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { StrategyComparison } from '../../api/types'
import { combinePortfolio } from '../../lib/portfolio'
import { fmtNumber } from '../../lib/format'
import { CompareEquityTV } from '../../charts/tv/CompareEquityTV'
import { useChartTheme } from '../../design/useChartTheme'

interface Props {
  strategies: StrategyComparison[]
  lang: Lang
}

/**
 * ポートフォリオ合成セクション（issue #375）。
 *
 * 相関ヒートマップの先にある「相関が低い戦略同士を合成したら Sharpe / DD は
 * どうなるか」を確認する。ウェイト（初期値: 等ウェイト）を指定して
 * 毎日リバランス想定の加重合成エクイティと主要指標を表示する。
 */
export function PortfolioComposer({ strategies, lang }: Props): ReactElement | null {
  const L = makeL(lang)
  const theme = useChartTheme()

  const eligible = useMemo(
    () =>
      strategies.filter(
        (s): s is StrategyComparison & { daily_returns: number[] } =>
          Boolean(s.daily_returns && s.daily_returns.length > 0 && s.equity),
      ),
    [strategies],
  )

  const [weights, setWeights] = useState<Record<string, number>>({})

  const result = useMemo(() => {
    if (eligible.length < 2) return null
    return combinePortfolio(
      eligible.map((s) => ({ dates: s.equity!.dates, returns: s.daily_returns })),
      eligible.map((s) => weights[s.id] ?? 1),
    )
  }, [eligible, weights])

  if (eligible.length < 2) return null

  const inputS: React.CSSProperties = {
    width: 64,
    padding: '4px 6px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-mono-sm)',
  }

  const totalWeight = eligible.reduce((acc, s) => acc + (weights[s.id] ?? 1), 0)

  const stats: ReadonlyArray<readonly [string, string, string]> | null = result
    ? [
        [
          L('合成リターン', 'Combined return'),
          fmtNumber(result.metrics.totalReturnPct, { decimals: 1, suffix: '%', sign: true }),
          result.metrics.totalReturnPct >= 0 ? 'var(--success)' : 'var(--danger)',
        ],
        ['Sharpe', fmtNumber(result.metrics.sharpe, { decimals: 2 }), 'var(--text)'],
        [
          'Max DD',
          fmtNumber(result.metrics.maxDrawdownPct, { decimals: 1, suffix: '%' }),
          'var(--danger)',
        ],
        [
          L('年率ボラ', 'Volatility'),
          fmtNumber(result.metrics.volatilityPct, { decimals: 1, suffix: '%' }),
          'var(--text)',
        ],
      ]
    : null

  return (
    <section data-testid="portfolio-composer" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            fontWeight: 600,
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
          }}
        >
          {L('ポートフォリオ合成', 'Portfolio composition')}
        </h2>
        <p
          style={{
            margin: '4px 0 0',
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          {L(
            'ウェイトを指定して加重合成した場合の成績です（毎日リバランス想定・共通期間のみ・日次リターンから算出）。',
            'Performance of a weighted combination (daily rebalancing assumed, overlapping period only, computed from daily returns).',
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {eligible.map((s) => {
          const w = weights[s.id] ?? 1
          const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0
          return (
            <label
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-caption)',
                color: 'var(--text2)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
              <input
                type="number"
                min="0"
                step="0.5"
                aria-label={L(`${s.name} のウェイト`, `Weight of ${s.name}`)}
                value={w}
                style={inputS}
                onChange={(e) =>
                  setWeights((prev) => ({
                    ...prev,
                    [s.id]: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                {fmtNumber(pct, { decimals: 0, suffix: '%' })}
              </span>
            </label>
          )
        })}
      </div>

      {result && stats ? (
        <>
          <div
            data-testid="portfolio-stats"
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
            {stats.map(([label, value, color]) => (
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
                  style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem', fontWeight: 600, color }}
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
              {L(`共通期間 ${result.metrics.days} 日`, `${result.metrics.days} overlapping days`)}
            </span>
          </div>
          <CompareEquityTV
            series={[
              {
                id: '__portfolio__',
                label: L('合成ポートフォリオ', 'Combined portfolio'),
                dates: result.dates,
                values: result.equity,
                color: theme.accent,
                isBaseline: true,
              },
            ]}
            lang={lang}
          />
        </>
      ) : (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          {L(
            '共通期間が不足しているため合成できません（重なった営業日が 2 日未満）。',
            'Cannot combine: fewer than 2 overlapping trading days.',
          )}
        </p>
      )}
    </section>
  )
}
