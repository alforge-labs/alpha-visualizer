import { useState, useEffect } from 'react'
import type { BacktestMetrics } from '../api/types'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { METRIC_DEFINITIONS } from '../constants/metricDefinitions'

interface Props {
  metrics: BacktestMetrics
  lang: Lang
}

interface TooltipState { key: string; x: number; y: number }

export function MetricsSummaryBar({ metrics, lang }: Props) {
  const [tip, setTip] = useState<TooltipState | null>(null)
  const L = makeL(lang)

  useEffect(() => {
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [])

  const items: { key: keyof BacktestMetrics; suffix: string; decimals: number }[] = [
    { key: 'sharpe_ratio', suffix: '', decimals: 2 },
    { key: 'cagr_pct', suffix: '%', decimals: 1 },
    { key: 'max_drawdown_pct', suffix: '%', decimals: 1 },
    { key: 'win_rate_pct', suffix: '%', decimals: 1 },
    { key: 'profit_factor', suffix: '', decimals: 2 },
    { key: 'total_trades', suffix: '', decimals: 0 },
  ]

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0 16px',
      borderBottom: '1px solid var(--border)', marginBottom: 16, position: 'relative',
    }}>
      {items.map(({ key, suffix, decimals }) => {
        const def = METRIC_DEFINITIONS[key]
        const val = metrics[key] as number | undefined
        const display = val == null ? '—' : val.toFixed(decimals) + suffix
        return (
          <div key={key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            background: 'var(--surface)', borderRadius: 6, padding: '6px 12px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                {L(def?.label ?? key, def?.labelEn ?? key)}
              </span>
              <span
                style={{ fontSize: 10, color: 'var(--text3)', cursor: 'pointer', opacity: 0.6 }}
                onMouseEnter={e => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect()
                  setTip({ key, x: rect.left, y: rect.bottom + 4 })
                }}
                onMouseLeave={() => setTip(null)}
              >ⓘ</span>
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>
              {display}
            </span>
          </div>
        )
      })}
      {tip && (() => {
        const def = METRIC_DEFINITIONS[tip.key]
        if (!def) return null
        return (
          <div style={{
            position: 'fixed', left: tip.x, top: tip.y, zIndex: 100,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 12px', maxWidth: 280,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 4 }}>
              {L(def.description, def.descriptionEn)}
            </div>
            {def.formula && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {def.formula}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
