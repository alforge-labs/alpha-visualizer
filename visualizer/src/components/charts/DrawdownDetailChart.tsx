import { useMemo } from 'react'
import { useDashboard } from '../../contexts/DashboardContext'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

interface DrawdownPeriod {
  startIdx: number
  peakIdx: number
  endIdx: number
  depth: number
  durationDays: number
  recoveryDays: number | null
  startDate: string
  endDate: string
}

function detectTopDrawdowns(dd: number[], dates: string[], top = 5): DrawdownPeriod[] {
  const periods: DrawdownPeriod[] = []
  let inDD = false
  let start = 0
  let minIdx = 0
  let minVal = 0

  for (let i = 0; i < dd.length; i++) {
    const cur = dd[i] ?? 0
    if (!inDD && cur < -0.01) {
      inDD = true
      start = i
      minIdx = i
      minVal = cur
    } else if (inDD) {
      if (cur < minVal) { minIdx = i; minVal = cur }
      if (cur >= -0.01 || i === dd.length - 1) {
        const recovery = cur >= -0.01 ? i - minIdx : null
        periods.push({
          startIdx: start, peakIdx: minIdx, endIdx: i,
          depth: minVal,
          durationDays: i - start,
          recoveryDays: recovery,
          startDate: dates[start] ?? '',
          endDate: dates[i] ?? '',
        })
        inDD = false
      }
    }
  }
  return periods.sort((a, b) => a.depth - b.depth).slice(0, top)
}

interface Props {
  drawdown: number[]
  dates: string[]
  lang: Lang
}

export function DrawdownDetailChart({ drawdown, dates, lang }: Props) {
  const { setHighlightedDateRange } = useDashboard()
  const L = makeL(lang)

  const periods = useMemo(() => detectTopDrawdowns(drawdown, dates), [drawdown, dates])

  const maxDepth = Math.abs(Math.min(...periods.map(p => p.depth), -0.01))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
        {L('クリックで Overview に期間ハイライト', 'Click to highlight period in Overview')}
      </div>
      {periods.map((p, i) => {
        const barWidth = (Math.abs(p.depth) / maxDepth) * 100
        return (
          <div key={i}
            onClick={() => setHighlightedDateRange({ start: p.startDate, end: p.endDate })}
            style={{
              display: 'grid', gridTemplateColumns: '80px 1fr 120px',
              alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '6px 8px', borderRadius: 6,
              background: 'var(--surface)', border: '1px solid var(--border)',
              transition: 'border-color 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-glow)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff5c5c' }}>
              {p.depth.toFixed(2)}%
            </span>
            <div style={{ background: 'var(--border)', borderRadius: 2, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${barWidth}%`, height: '100%', background: '#ff5c5c', borderRadius: 2 }} />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
              <div>{p.startDate.slice(0, 10)}</div>
              <div>{p.durationDays}d / {p.recoveryDays != null ? `${p.recoveryDays}d回復` : L('未回復', 'No recovery')}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
