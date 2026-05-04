import { useMemo, useState } from 'react'
import { useDashboard } from '../../contexts/DashboardContext'
import { getRangeN } from '../../contexts/dashboardConstants'

interface Props {
  dailyReturns: number[]
  dates: string[]
  compact?: boolean
}

const WINDOWS = [30, 60, 90] as const
type Window = (typeof WINDOWS)[number]

function computeRollingSharpe(returns: number[], window: number): (number | null)[] {
  const result: (number | null)[] = new Array(returns.length).fill(null)
  for (let i = window - 1; i < returns.length; i++) {
    const slice = returns.slice(i - window + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / window
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (window - 1)
    const std = Math.sqrt(variance)
    result[i] = std === 0 ? 0 : (mean / std) * Math.sqrt(252)
  }
  return result
}

export function RollingMetricsChart({ dailyReturns, dates, compact = false }: Props) {
  const { selectedRange } = useDashboard()
  const [win, setWin] = useState<Window>(60)
  const [tooltip, setTooltip] = useState<{ x: number; v: number; date: string } | null>(null)

  const W = 800, H = compact ? 160 : 220
  const P = { l: 58, r: 20, t: 16, b: compact ? 24 : 32 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const { slicedSharpe, slicedDates } = useMemo(() => {
    const n = dailyReturns.length
    const bars = Math.min(getRangeN(selectedRange), n)
    const s = Math.max(0, n - bars)
    const sharpe = computeRollingSharpe(dailyReturns, win)
    return {
      slicedSharpe: sharpe.slice(s),
      slicedDates: dates.slice(s + 1),
    }
  }, [dailyReturns, dates, selectedRange, win])

  const valid = slicedSharpe.filter((v): v is number => v !== null)
  const minV = Math.min(...valid, -1)
  const maxV = Math.max(...valid, 1)
  const span = maxV - minV || 1
  const len = slicedSharpe.length

  function toX(i: number) { return P.l + (i / Math.max(len - 1, 1)) * pW }
  function toY(v: number) { return P.t + pH - ((v - minV) / span) * pH }

  const pathD = slicedSharpe.reduce<string>((acc, v, i) => {
    if (v === null) return acc
    return acc + (acc === '' ? 'M' : 'L') + `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`
  }, '')

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {WINDOWS.map(w => (
          <button key={w} onClick={() => setWin(w)} style={{
            height: 22, padding: '0 8px', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 11,
            background: win === w ? 'var(--accent-bg)' : 'var(--surface)',
            border: win === w ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
            color: win === w ? 'var(--accent)' : 'var(--text2)',
          }}>{w}d</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
          const mx = (e.clientX - rect.left) * (W / rect.width)
          const i = Math.round(((mx - P.l) / pW) * Math.max(len - 1, 1))
          const ci = Math.max(0, Math.min(len - 1, i))
          const v = slicedSharpe[ci] ?? null
          if (v !== null) setTooltip({ x: toX(ci), v, date: slicedDates[ci] ?? '' })
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {[-2, -1, 0, 1, 2].filter(v => v >= minV - 0.1 && v <= maxV + 0.1).map(v => (
          <g key={v}>
            <line x1={P.l} x2={P.l + pW} y1={toY(v)} y2={toY(v)}
              stroke={v === 0 ? 'var(--text3)' : 'var(--border)'}
              strokeWidth={v === 0 ? 1 : 0.5}
              strokeDasharray={v === 0 ? undefined : '3,3'} />
            <text x={P.l - 4} y={toY(v) + 4} textAnchor="end" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">{v}</text>
          </g>
        ))}
        <path d={pathD} fill="none" stroke="#00e49a" strokeWidth={1.5} />
        {tooltip && <line x1={tooltip.x} x2={tooltip.x} y1={P.t} y2={P.t + pH} stroke="var(--text3)" strokeWidth={0.5} />}
        {len > 1 && [0, Math.floor(len / 2), len - 1].map(i => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">
            {(slicedDates[i] ?? '').slice(0, 7)}
          </text>
        ))}
      </svg>
      {tooltip && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', marginTop: 4 }}>
          {tooltip.date} — Sharpe({win}d): <span style={{ color: tooltip.v >= 0 ? '#00e49a' : '#ff5c5c' }}>{tooltip.v.toFixed(3)}</span>
        </div>
      )}
    </div>
  )
}
