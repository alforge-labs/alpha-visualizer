import type { CSSProperties } from 'react'
import type { BacktestMetrics } from '../api/types'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { fmtNumber } from '../lib/format'
import { METRIC_DEFINITIONS } from '../constants/metricDefinitions'
import { MetricInfoTip } from './metrics/MetricInfoTip'

interface Props {
  metrics: BacktestMetrics
  lang: Lang
}

interface Item {
  key: keyof BacktestMetrics
  suffix: string
  decimals: number
  /** 値の色を判定 */
  tone?: (v: number) => 'positive' | 'negative' | 'warning' | 'neutral'
}

const TONE_COLOR = {
  positive: 'var(--success)',
  negative: 'var(--danger)',
  warning: 'var(--warn)',
  neutral: 'var(--text)',
} as const

const ITEMS: Item[] = [
  {
    key: 'sharpe_ratio',
    suffix: '',
    decimals: 2,
    tone: (v) => (v >= 1 ? 'positive' : v >= 0.5 ? 'warning' : 'negative'),
  },
  {
    key: 'cagr_pct',
    suffix: '%',
    decimals: 1,
    tone: (v) => (v > 0 ? 'positive' : 'negative'),
  },
  {
    key: 'max_drawdown_pct',
    suffix: '%',
    decimals: 1,
    tone: (v) => (Math.abs(v) <= 15 ? 'neutral' : Math.abs(v) <= 30 ? 'warning' : 'negative'),
  },
  {
    key: 'win_rate_pct',
    suffix: '%',
    decimals: 1,
    tone: (v) => (v >= 55 ? 'positive' : v >= 45 ? 'neutral' : 'negative'),
  },
  {
    key: 'profit_factor',
    suffix: '',
    decimals: 2,
    tone: (v) => (v >= 1.5 ? 'positive' : v >= 1 ? 'neutral' : 'negative'),
  },
  { key: 'total_trades', suffix: '', decimals: 0 },
]

export function MetricsSummaryBarV2({ metrics, lang }: Props) {
  const L = makeL(lang)

  return (
    <div
      className="metrics-summary-bar"
      data-testid="metrics-summary-bar"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(var(--cols-summary-bar), minmax(0, 1fr))',
        gap: 0,
        padding: 'var(--space-4) 0 var(--space-5)',
        borderBottom: '1px solid var(--border)',
        marginBottom: 'var(--space-6)',
        position: 'relative',
      }}
    >
      {ITEMS.map(({ key, suffix, decimals, tone }) => {
        const def = METRIC_DEFINITIONS[key]
        const val = metrics[key] as number | undefined
        // issue #266: 数値整形を SSoT（fmtNumber）経由へ統一し桁区切りを効かせる
        const display = fmtNumber(val, { decimals, suffix })
        const valueColor =
          typeof val === 'number' && tone ? TONE_COLOR[tone(val)] : 'var(--text)'

        // 境界線（左 or 上）は metrics-summary-bar クラス側の :nth-child セレクタが制御。
        const cellStyle: CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '0 var(--space-4)',
          minWidth: 0,
        }

        return (
          <div key={key} style={cellStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  color: 'var(--text3)',
                  letterSpacing: 'var(--tracking-caption)',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {L(def?.label ?? key, def?.labelEn ?? key)}
              </span>
              {/* issue #360: hover 限定 span から click/focus 対応の共通機構へ置換 */}
              <MetricInfoTip defKey={key} lang={lang} />
            </div>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 'var(--hero-fs-display)',
                fontWeight: 600,
                letterSpacing: 'var(--tracking-display)',
                color: valueColor,
                lineHeight: 1.05,
              }}
            >
              {display}
            </span>
          </div>
        )
      })}
    </div>
  )
}
