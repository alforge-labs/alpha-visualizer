import { useCallback, useState } from 'react'

interface DrawdownChartProps {
  dd: number[]
  dates: string[]
  isCutoffIdx: number
  compact: boolean
}

interface Tip {
  x: number
  y: number
  v: number
  date: string
}

export function DrawdownChart({ dd, dates, isCutoffIdx, compact }: DrawdownChartProps) {
  const [tooltip, setTooltip] = useState<Tip | null>(null)
  const W = 800
  const H = compact ? 72 : 96
  const P = { l: 58, r: 20, t: 8, b: 22 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b
  const minDD = Math.min(...dd) * 1.05 || -1

  const toX = (i: number) => P.l + (i / Math.max(dd.length - 1, 1)) * pW
  const toY = (v: number) => P.t + (1 - v / minDD) * pH

  const ddPath = dd
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ')
  const fillPath = `${ddPath} L${toX(dd.length - 1).toFixed(1)},${(P.t + pH).toFixed(1)} L${P.l},${(P.t + pH).toFixed(1)} Z`
  const cutoffX = isCutoffIdx > 0 && isCutoffIdx < dd.length ? toX(isCutoffIdx) : null

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const rawI = (((e.clientX - rect.left) / rect.width) * W - P.l) / pW * (dd.length - 1)
      const i = Math.max(0, Math.min(dd.length - 1, Math.round(rawI)))
      const v = dd[i]
      if (v == null) return
      setTooltip({ x: toX(i), y: toY(v), v, date: dates[i] ?? '' })
    },
    [dd, dates, pW]
  )

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
      onMouseMove={onMove}
      onMouseLeave={() => setTooltip(null)}
    >
      <defs>
        <linearGradient id="ddFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff5c5c" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ff5c5c" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <line
        x1={P.l}
        y1={P.t + pH}
        x2={P.l + pW}
        y2={P.t + pH}
        stroke="rgba(255,255,255,0.04)"
        strokeWidth="1"
      />
      <text
        x={P.l - 6}
        y={P.t + pH + 4}
        textAnchor="end"
        fill="var(--text3)"
        fontSize="11"
        fontFamily="'JetBrains Mono',monospace"
      >
        0
      </text>
      <text
        x={P.l - 6}
        y={P.t + 5}
        textAnchor="end"
        fill="var(--text3)"
        fontSize="11"
        fontFamily="'JetBrains Mono',monospace"
      >
        {minDD.toFixed(0)}%
      </text>
      {cutoffX !== null && (
        <line
          x1={cutoffX}
          y1={P.t}
          x2={cutoffX}
          y2={P.t + pH}
          stroke="rgba(115,120,144,0.35)"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      )}
      <path d={fillPath} fill="url(#ddFill)" />
      <path d={ddPath} fill="none" stroke="#ff5c5c" strokeWidth="1.5" />
      {tooltip && (
        <g>
          <line
            x1={tooltip.x}
            y1={P.t}
            x2={tooltip.x}
            y2={P.t + pH}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
          <circle
            cx={tooltip.x}
            cy={tooltip.y}
            r="3"
            fill="#ff5c5c"
            stroke="#07080d"
            strokeWidth="1.5"
          />
          <rect
            x={tooltip.x + 6}
            y={tooltip.y - 22}
            width={88}
            height={30}
            rx="4"
            fill="var(--surface)"
            stroke="var(--border-h)"
          />
          <text
            x={tooltip.x + 12}
            y={tooltip.y - 9}
            fill="var(--text2)"
            fontSize="11"
            fontFamily="'JetBrains Mono',monospace"
          >
            {tooltip.date}
          </text>
          <text
            x={tooltip.x + 12}
            y={tooltip.y + 4}
            fill="#ff5c5c"
            fontSize="11"
            fontFamily="'JetBrains Mono',monospace"
            fontWeight="600"
          >
            {tooltip.v.toFixed(2)}%
          </text>
        </g>
      )}
    </svg>
  )
}
