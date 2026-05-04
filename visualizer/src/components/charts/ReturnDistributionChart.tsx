import { useMemo } from 'react'
import { useDashboard } from '../../contexts/DashboardContext'
import { getRangeN } from '../../contexts/dashboardConstants'

export interface ReturnDataset {
  label: string
  returns: number[]
  color: string
}

interface Props {
  datasets: ReturnDataset[]
  var95?: number
  skewness?: number
  excessKurtosis?: number
  compact?: boolean
}

function computeHistogram(returns: number[], bins = 40): { x: number; count: number; width: number }[] {
  if (returns.length === 0) return []
  const min = Math.min(...returns)
  const max = Math.max(...returns)
  const width = (max - min) / bins || 0.01
  const counts = new Array(bins).fill(0)
  for (const r of returns) {
    const idx = Math.min(Math.floor((r - min) / width), bins - 1)
    counts[idx]++
  }
  return counts.map((count, i) => ({ x: min + (i + 0.5) * width, count, width }))
}

function normalPdf(x: number, mean: number, std: number): number {
  if (std === 0) return 0
  return Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI))
}

export function ReturnDistributionChart({ datasets, var95, skewness, excessKurtosis, compact = false }: Props) {
  const { selectedRange } = useDashboard()

  const W = 800, H = compact ? 200 : 260
  const P = { l: 50, r: 20, t: 24, b: 36 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const primary = datasets[0]
  const returns = useMemo(() => {
    if (!primary) return []
    const n = primary.returns.length
    const bars = Math.min(getRangeN(selectedRange), n)
    return primary.returns.slice(Math.max(0, n - bars))
  }, [primary, selectedRange])

  const hist = useMemo(() => computeHistogram(returns), [returns])

  const allX = hist.map(h => h.x)
  const minX = Math.min(...allX, -3)
  const maxX = Math.max(...allX, 3)
  const maxCount = Math.max(...hist.map(h => h.count), 1)

  function toX(x: number) { return P.l + ((x - minX) / (maxX - minX)) * pW }
  function toY(count: number) { return P.t + pH - (count / maxCount) * pH }

  const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const std = returns.length > 1
    ? Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1))
    : 1

  const normalPath = (() => {
    const steps = 100
    const step = (maxX - minX) / steps
    return Array.from({ length: steps + 1 }, (_, i) => {
      const x = minX + i * step
      const density = normalPdf(x, mean, std)
      const scaledCount = density * returns.length * (hist[0]?.width ?? 0.1)
      return `${i === 0 ? 'M' : 'L'}${toX(x).toFixed(1)},${toY(scaledCount).toFixed(1)}`
    }).join(' ')
  })()

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {hist.map((h, i) => {
          const x = toX(h.x - h.width / 2)
          const w = Math.max((pW / hist.length) - 1, 1)
          const isLeft = h.x < 0
          return (
            <rect key={i} x={x} y={toY(h.count)} width={w} height={toY(0) - toY(h.count)}
              fill={isLeft ? 'rgba(255,92,92,0.5)' : 'rgba(0,228,154,0.5)'} />
          )
        })}
        <path d={normalPath} fill="none" stroke="var(--text3)" strokeWidth={1} strokeDasharray="4,3" />
        <line x1={toX(0)} x2={toX(0)} y1={P.t} y2={P.t + pH} stroke="var(--text3)" strokeWidth={0.5} />
        {var95 != null && (
          <g>
            <line x1={toX(-var95)} x2={toX(-var95)} y1={P.t} y2={P.t + pH} stroke="#ff5c5c" strokeWidth={1.5} strokeDasharray="4,2" />
            <text x={toX(-var95) - 3} y={P.t + 12} textAnchor="end" fontSize={9} fill="#ff5c5c" fontFamily="var(--mono)">VaR95</text>
          </g>
        )}
        {[-2, -1, 0, 1, 2].filter(v => v >= minX && v <= maxX).map(v => (
          <text key={v} x={toX(v)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">{v}%</text>
        ))}
        {skewness != null && (
          <text x={P.l + pW - 4} y={P.t + 14} textAnchor="end" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">
            {`歪度: ${skewness.toFixed(2)}  尖度: ${(excessKurtosis ?? 0).toFixed(2)}`}
          </text>
        )}
      </svg>
    </div>
  )
}
