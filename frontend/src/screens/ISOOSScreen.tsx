import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { BacktestDetail, BacktestMetrics } from '../api/types'
import { SectionHeader, SectionLabel } from '../design/primitives'
import { EquityChartV } from '../charts/visx/EquityChartV'
import { ISOOSMetrics } from '../components/metrics/ISOOSMetrics'

interface Props {
  data: BacktestDetail
  compact: boolean
  lang: Lang
}

const DEGRADE_KEYS = ['sharpe_ratio', 'win_rate_pct', 'profit_factor'] as const

export function ISOOSScreen({ data, compact, lang }: Props) {
  const L = makeL(lang)
  const isM = data.is_metrics
  const oosM = data.oos_metrics
  if (!isM || !oosM) {
    return (
      <div data-testid="isoos-screen" style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionHeader
          title={L('IS / OOS 詳細比較', 'IS / OOS Deep Comparison')}
          subtitle={L(
            'このバックテストには IS/OOS 分割が設定されていません',
            'No IS/OOS split is configured for this backtest'
          )}
        />
      </div>
    )
  }
  const eff = ((oosM.sharpe_ratio / isM.sharpe_ratio) * 100).toFixed(1)
  const degMetrics = DEGRADE_KEYS.filter((k) => {
    const isVal = isM[k] as number | undefined
    const oosVal = oosM[k] as number | undefined
    return typeof isVal === 'number' && typeof oosVal === 'number' && oosVal < isVal * 0.8
  }) as readonly (keyof BacktestMetrics)[]

  const effNum = parseFloat(eff)
  const right = (
    <div style={{ display: 'flex', gap: 12 }}>
      {(
        [
          [L('OOS効率', 'OOS Efficiency'), `${eff}%`, effNum >= 70 ? 'var(--success)' : 'var(--warn)'],
          [L('IS Sharpe', 'IS Sharpe'), isM.sharpe_ratio.toFixed(2), 'var(--success)'],
          [
            L('OOS Sharpe', 'OOS Sharpe'),
            oosM.sharpe_ratio.toFixed(2),
            oosM.sharpe_ratio >= 0.8 ? 'var(--success)' : 'var(--warn)',
          ],
        ] as const
      ).map(([lbl, val, c], i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            alignItems: 'flex-end',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-caption)',
            }}
          >
            {lbl}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 16,
              fontWeight: 700,
              color: c,
            }}
          >
            {val}
          </span>
        </div>
      ))}
    </div>
  )

  return (
    <div data-testid="isoos-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionHeader
        title={L('IS / OOS 詳細比較', 'IS / OOS Deep Comparison')}
        subtitle={`IS 60% (〜${data.is_cutoff.date ?? '—'})  /  OOS 40%`}
        right={right}
      />

      {degMetrics.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            gap: 8,
            padding: '10px 14px',
            background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <span style={{ color: 'var(--warn)', fontSize: 15 }}>⚠</span>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 14,
              color: 'var(--warn)',
              lineHeight: 1.5,
            }}
          >
            {L(
              `OOS劣化が検出されました: ${degMetrics.join(', ')}`,
              `OOS degradation detected: ${degMetrics.join(', ')}`
            )}
          </span>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <SectionLabel>
          {L('エクイティカーブ (IS/OOS境界線付き)', 'Equity Curve with IS/OOS Boundary')}
        </SectionLabel>
        <EquityChartV
          equity={data.equity.values}
          dates={data.equity.dates}
          isCutoffIdx={data.is_cutoff.index}
          compact={compact}
        />
      </div>

      <ISOOSMetrics isM={isM} oosM={oosM} lang={lang} />
    </div>
  )
}
