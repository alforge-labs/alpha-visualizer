import { useMemo } from 'react'
import { useDashboard } from '../../contexts/DashboardContext'
import { getRangeN } from '../../contexts/dashboardConstants'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

interface Props {
  dailyReturns: number[]
  var95: number
  cvar95: number
  lang: Lang
}

export function VaRChart({ dailyReturns, var95, cvar95, lang }: Props) {
  const { selectedRange } = useDashboard()
  const L = makeL(lang)

  const returns = useMemo(() => {
    const n = dailyReturns.length
    const bars = Math.min(getRangeN(selectedRange), n)
    return dailyReturns.slice(Math.max(0, n - bars))
  }, [dailyReturns, selectedRange])

  const W = 800, H = 200
  const P = { l: 50, r: 20, t: 24, b: 36 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const sorted = [...returns].sort((a, b) => a - b)
  const BINS = 40
  const minX = Math.min(sorted[0] ?? -5, -0.5)
  const maxX = Math.min(sorted[sorted.length - 1] ?? 0, 0)
  const spanX = maxX - minX || 1
  const binW = (maxX - minX) / BINS || 0.01

  const hist = Array.from({ length: BINS }, (_, i) => {
    const lo = minX + i * binW
    const hi = lo + binW
    return { x: lo + binW / 2, count: sorted.filter(v => v >= lo && v < hi).length }
  })

  const maxCount = Math.max(...hist.map(h => h.count), 1)
  function toX(x: number) { return P.l + ((x - minX) / spanX) * pW }
  function toY(count: number) { return P.t + pH - (count / maxCount) * pH }

  const varLine = toX(-var95)
  const cvarLine = toX(-cvar95)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {hist.map((h, i) => {
          const x = toX(h.x - binW / 2)
          const bw = Math.max((pW / BINS) - 1, 1)
          const isTail = h.x < -var95
          return (
            <rect key={i} x={x} y={toY(h.count)} width={bw} height={toY(0) - toY(h.count)}
              fill={isTail ? 'rgba(255,92,92,0.8)' : 'rgba(255,92,92,0.3)'} />
          )
        })}
        <line x1={varLine} x2={varLine} y1={P.t} y2={P.t + pH} stroke="#ff5c5c" strokeWidth={2} />
        <text x={varLine - 4} y={P.t + 12} textAnchor="end" fontSize={9} fill="#ff5c5c" fontFamily="var(--mono)">
          VaR95 {var95.toFixed(2)}%
        </text>
        {cvar95 > var95 && (
          <g>
            <line x1={cvarLine} x2={cvarLine} y1={P.t} y2={P.t + pH} stroke="#ff8c42" strokeWidth={2} strokeDasharray="4,2" />
            <text x={cvarLine - 4} y={P.t + 22} textAnchor="end" fontSize={9} fill="#ff8c42" fontFamily="var(--mono)">
              CVaR95 {cvar95.toFixed(2)}%
            </text>
          </g>
        )}
        {[-4, -3, -2, -1, 0].filter(v => v >= minX && v <= maxX).map(v => (
          <text key={v} x={toX(v)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">{v}%</text>
        ))}
      </svg>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        {L(
          `5%の確率で1日あたり ${var95.toFixed(2)}% 以上の損失が発生（VaR95）。テール期待損失は ${cvar95.toFixed(2)}%（CVaR95）。`,
          `5% chance of losing more than ${var95.toFixed(2)}% per day (VaR95). Expected tail loss: ${cvar95.toFixed(2)}% (CVaR95).`
        )}
      </div>
    </div>
  )
}
