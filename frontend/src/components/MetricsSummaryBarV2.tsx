import { useState, useEffect, type CSSProperties } from 'react'
import type { BacktestMetrics } from '../api/types'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { METRIC_DEFINITIONS } from '../constants/metricDefinitions'

interface Props {
  metrics: BacktestMetrics
  lang: Lang
}

interface TooltipState {
  key: string
  x: number
  y: number
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
  const [tip, setTip] = useState<TooltipState | null>(null)
  const L = makeL(lang)

  useEffect(() => {
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [])

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
        const display = val == null ? '—' : val.toFixed(decimals) + suffix
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
              {def && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text3)',
                    cursor: 'help',
                    opacity: 0.55,
                  }}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    setTip({ key, x: rect.left, y: rect.bottom + 4 })
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  ⓘ
                </span>
              )}
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
      {tip && (() => {
        const def = METRIC_DEFINITIONS[tip.key]
        if (!def) return null
        // モバイル/狭幅で右端からはみ出さないようクランプ。
        const TIP_W = 320
        const left = Math.max(8, Math.min(tip.x, window.innerWidth - TIP_W - 8))
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top: tip.y,
              zIndex: 100,
              background: 'var(--surface)',
              border: '1px solid var(--border-h)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              maxWidth: TIP_W,
              boxShadow: 'var(--shadow-2)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-body)',
                color: 'var(--text)',
                marginBottom: 6,
                lineHeight: 1.45,
              }}
            >
              {L(def.description, def.descriptionEn)}
            </div>
            {def.formula && (
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  color: 'var(--text3)',
                  letterSpacing: 'var(--tracking-mono)',
                }}
              >
                {def.formula}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
