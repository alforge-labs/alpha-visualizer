import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Variation } from '../hooks/useTheme'
import type { BacktestDetail, BacktestMetrics } from '../api/types'
import { SecHead, SectionLabel } from '../components/common'
import { EquityChart } from '../components/charts/EquityChart'
import { ISOOSMetrics } from '../components/metrics/ISOOSMetrics'

interface Props {
  data: BacktestDetail
  compact: boolean
  lang: Lang
  variation: Variation
}

const DEGRADE_KEYS = ['sharpe_ratio', 'win_rate_pct', 'profit_factor'] as const

export function ISOOSScreen({ data, compact, lang, variation }: Props) {
  const L = makeL(lang)
  const isM = data.is_metrics
  const oosM = data.oos_metrics
  if (!isM || !oosM) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <SecHead
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
          [L('OOS効率', 'OOS Efficiency'), `${eff}%`, effNum >= 70 ? '#00e49a' : '#f5a623'],
          [L('IS Sharpe', 'IS Sharpe'), isM.sharpe_ratio.toFixed(2), '#00e49a'],
          [
            L('OOS Sharpe', 'OOS Sharpe'),
            oosM.sharpe_ratio.toFixed(2),
            oosM.sharpe_ratio >= 0.8 ? '#00e49a' : '#f5a623',
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
              fontSize: 11,
              color: 'var(--text3)',
              letterSpacing: '0.08em',
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SecHead
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
            background: 'rgba(245,166,35,0.06)',
            border: '1px solid rgba(245,166,35,0.2)',
            borderRadius: 7,
          }}
        >
          <span style={{ color: '#f5a623', fontSize: 14 }}>⚠</span>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: '#f5a623',
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
        <EquityChart
          equity={data.equity.values}
          dates={data.equity.dates}
          isCutoffIdx={data.is_cutoff.index}
          compact={compact}
          variation={variation}
        />
      </div>

      <ISOOSMetrics isM={isM} oosM={oosM} lang={lang} variation={variation} />
    </div>
  )
}
