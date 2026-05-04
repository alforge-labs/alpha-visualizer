import { useMemo, useState } from 'react'
import { useDashboard } from '../../contexts/DashboardContext'
import { getRangeN } from '../../contexts/dashboardConstants'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

interface Props {
  dailyReturns: number[]
  dates: string[]
  lang: Lang
  compact?: boolean
}

interface WeekdayStat { day: string; avg: number; count: number; winRate: number }

function computeWeekdayStats(returns: number[], dates: string[]): WeekdayStat[] {
  const dayLabels = ['月', '火', '水', '木', '金']
  const stats = dayLabels.map(() => ({ total: 0, count: 0, wins: 0 }))
  for (let i = 0; i < returns.length; i++) {
    const d = new Date(dates[i + 1] ?? '')
    const idx = d.getDay() - 1
    if (idx >= 0 && idx <= 4) {
      const s = stats[idx]
      const r = returns[i]
      if (s != null && r != null) {
        s.total += r
        s.count++
        if (r > 0) s.wins++
      }
    }
  }
  return dayLabels.map((day, i) => {
    const s = stats[i] ?? { total: 0, count: 0, wins: 0 }
    return {
      day,
      avg: s.count > 0 ? s.total / s.count : 0,
      count: s.count,
      winRate: s.count > 0 ? (s.wins / s.count) * 100 : 0,
    }
  })
}

export function WeekdayPerformanceChart({ dailyReturns, dates, lang, compact = false }: Props) {
  const { selectedRange } = useDashboard()
  const [hovIdx, setHovIdx] = useState<number | null>(null)
  const L = makeL(lang)

  const { slicedReturns, slicedDates } = useMemo(() => {
    const n = dailyReturns.length
    const bars = Math.min(getRangeN(selectedRange), n)
    const s = Math.max(0, n - bars)
    return {
      slicedReturns: dailyReturns.slice(s),
      slicedDates: dates.slice(s),
    }
  }, [dailyReturns, dates, selectedRange])

  const stats = useMemo(() => computeWeekdayStats(slicedReturns, slicedDates), [slicedReturns, slicedDates])

  const W = 400, H = compact ? 160 : 200
  const P = { l: 40, r: 20, t: 20, b: 36 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const maxAbs = Math.max(...stats.map(s => Math.abs(s.avg)), 0.01)
  const barW = pW / stats.length - 4
  const midY = P.t + pH / 2

  function barH(avg: number) { return Math.abs(avg) / maxAbs * (pH / 2) }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        <line x1={P.l} x2={P.l + pW} y1={midY} y2={midY} stroke="var(--text3)" strokeWidth={0.75} />
        {[-maxAbs, -maxAbs / 2, maxAbs / 2, maxAbs].map(v => {
          const y = midY - (v / maxAbs) * (pH / 2)
          return (
            <g key={v}>
              <line x1={P.l} x2={P.l + pW} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.4} />
              <text x={P.l - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">
                {v.toFixed(2)}%
              </text>
            </g>
          )
        })}
        {stats.map((s, i) => {
          const x = P.l + i * (pW / stats.length) + 2
          const h = barH(s.avg)
          const y = s.avg >= 0 ? midY - h : midY
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h}
                fill={s.avg >= 0 ? 'rgba(0,228,154,0.7)' : 'rgba(255,92,92,0.7)'}
                opacity={hovIdx === i ? 1 : 0.8}
                onMouseEnter={() => setHovIdx(i)}
                onMouseLeave={() => setHovIdx(null)}
                style={{ cursor: 'pointer' }}
              />
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text2)" fontFamily="var(--sans)">
                {s.day}
              </text>
            </g>
          )
        })}
      </svg>
      {hovIdx !== null && stats[hovIdx] && (
        <div style={{
          position: 'absolute', top: 8, right: 8, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px',
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
        }}>
          <div>{stats[hovIdx].day}曜日</div>
          <div>平均: {stats[hovIdx].avg.toFixed(3)}%</div>
          <div>勝率: {stats[hovIdx].winRate.toFixed(1)}%</div>
          <div>{L('件数', 'Count')}: {stats[hovIdx].count}</div>
        </div>
      )}
    </div>
  )
}
