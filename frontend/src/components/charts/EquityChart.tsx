import { useCallback, useContext, useMemo, useState } from 'react'
import type { Variation } from '../../hooks/useTheme'
import { DashboardContext } from '../../contexts/DashboardContext'
import { RANGES, getRangeN } from '../../contexts/dashboardConstants'

interface EquityChartProps {
  equity: number[]
  dates: string[]
  isCutoffIdx: number
  benchmark?: number[]
  showBenchmark?: boolean
  compact: boolean
  variation: Variation
  highlightedDateRange?: { start: string; end: string } | null
}

interface Tooltip {
  i: number
  x: number
  y: number
  v: number
  date: string
  retPct: string
  isOOS: boolean
}

export function EquityChart({
  equity,
  dates,
  isCutoffIdx,
  benchmark,
  showBenchmark = false,
  compact,
  variation,
  highlightedDateRange,
}: EquityChartProps) {
  type Range = (typeof RANGES)[number]
  const ctx = useContext(DashboardContext)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [localRange, setLocalRange] = useState<Range>('ALL')
  const range = ctx?.selectedRange ?? localRange
  const setRange = ctx?.setSelectedRange ?? setLocalRange

  const W = 800
  const H = compact ? 180 : 252
  const P = { l: 58, r: 20, t: 16, b: compact ? 24 : 32 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const { slice, sliceDates, sliceBmk, startIdx } = useMemo(() => {
    const n = equity.length
    const bars = Math.min(getRangeN(range), n)
    const s = Math.max(0, n - bars)
    return {
      slice: equity.slice(s),
      sliceDates: dates.slice(s),
      sliceBmk: benchmark ? benchmark.slice(s) : null,
      startIdx: s,
    }
  }, [equity, dates, benchmark, range])

  const { minV, maxV } = useMemo(() => {
    const all = showBenchmark && sliceBmk ? [...slice, ...sliceBmk] : slice
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    const pad = (hi - lo) * 0.06
    return { minV: lo - pad, maxV: hi + pad }
  }, [slice, sliceBmk, showBenchmark])

  const span = Math.max(maxV - minV, 1e-9)
  const toX = useCallback(
    (i: number) => P.l + (i / Math.max(slice.length - 1, 1)) * pW,
    [P.l, pW, slice.length]
  )
  const toY = useCallback((v: number) => P.t + (1 - (v - minV) / span) * pH, [P.t, pH, minV, span])

  const eqPath = useMemo(
    () =>
      slice.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' '),
    [slice, toX, toY]
  )

  const fillPath = useMemo(
    () =>
      `${eqPath} L${toX(slice.length - 1).toFixed(1)},${(P.t + pH).toFixed(1)} L${P.l},${(P.t + pH).toFixed(1)} Z`,
    [eqPath, slice.length, toX, P.t, pH, P.l]
  )

  const bmkPath = useMemo(
    () =>
      sliceBmk
        ? sliceBmk.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
        : null,
    [sliceBmk, toX, toY]
  )

  const visibleCutoff = isCutoffIdx - startIdx
  const cutoffX = visibleCutoff > 0 && visibleCutoff < slice.length - 1 ? toX(visibleCutoff) : null

  const yTicks = useMemo(() => {
    const n = compact ? 3 : 5
    return Array.from({ length: n }, (_, i) => {
      const v = minV + (1 - i / (n - 1)) * (maxV - minV)
      return { y: toY(v), label: v.toFixed(0) }
    })
  }, [minV, maxV, compact, toY])

  const xLabels = useMemo(() => {
    const n = sliceDates.length
    const ct = compact ? 4 : 6
    return Array.from({ length: ct }, (_, i) => {
      const idx = Math.round((i / (ct - 1)) * (n - 1))
      return { x: toX(idx), label: sliceDates[idx] ? sliceDates[idx]!.slice(0, 7) : '' }
    })
  }, [sliceDates, compact, toX])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const rawI = (((e.clientX - rect.left) / rect.width) * W - P.l) / pW * (slice.length - 1)
      const i = Math.max(0, Math.min(slice.length - 1, Math.round(rawI)))
      const v = slice[i]
      const first = slice[0]
      if (v == null || first == null) return
      const isOOS = startIdx + i >= isCutoffIdx
      const retPct = ((v / first - 1) * 100).toFixed(2)
      setTooltip({ i, x: toX(i), y: toY(v), v, date: sliceDates[i] ?? '', retPct, isOOS })
    },
    [slice, sliceDates, startIdx, isCutoffIdx, pW, P.l, toX, toY]
  )

  const last = slice[slice.length - 1] ?? 0
  const first = slice[0] ?? 0
  const isPos = last >= first
  const lineColor = isPos ? '#00e49a' : '#ff5c5c'
  const noFill = variation === 'terminal'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: P.l }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              height: 22,
              padding: '0 7px',
              background: range === r ? 'var(--accent-bg)' : 'transparent',
              border: range === r ? '1px solid var(--accent-glow)' : '1px solid transparent',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 500,
              color: range === r ? 'var(--accent)' : 'var(--text3)',
              transition: 'all 0.12s',
            }}
          >
            {r}
          </button>
        ))}
        {showBenchmark && (
          <div style={{ marginLeft: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            {(
              [
                ['var(--accent)', '━━', 'Strategy'],
                ['#383d5a', '╌╌', 'Buy&Hold'],
              ] as const
            ).map(([c, d, l], i) => (
              <span
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: c,
                }}
              >
                <span>{d}</span>
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={noFill ? 0 : 0.22} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={noFill ? 0 : 0.02} />
          </linearGradient>
          <clipPath id="cClip">
            <rect x={P.l} y={P.t} width={pW} height={pH} />
          </clipPath>
        </defs>

        {cutoffX !== null && (
          <rect
            x={P.l}
            y={P.t}
            width={cutoffX - P.l}
            height={pH}
            fill="rgba(0,228,154,0.025)"
            clipPath="url(#cClip)"
          />
        )}

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={P.l}
              y1={t.y}
              x2={P.l + pW}
              y2={t.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
            <text
              x={P.l - 6}
              y={t.y + 4}
              textAnchor="end"
              fill="var(--text3)"
              fontSize="11"
              fontFamily="'JetBrains Mono',monospace"
            >
              {t.label}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 3}
            textAnchor="middle"
            fill="var(--text3)"
            fontSize="11"
            fontFamily="'JetBrains Mono',monospace"
          >
            {l.label}
          </text>
        ))}

        {showBenchmark && bmkPath && (
          <path
            d={bmkPath}
            fill="none"
            stroke="#2a2e45"
            strokeWidth="1.5"
            strokeDasharray="4,3"
            clipPath="url(#cClip)"
          />
        )}
        <path d={fillPath} fill="url(#eqFill)" clipPath="url(#cClip)" />
        <path
          d={eqPath}
          fill="none"
          stroke={lineColor}
          strokeWidth={noFill ? 1.5 : 2}
          clipPath="url(#cClip)"
        />

        {cutoffX !== null && (
          <g>
            <line
              x1={cutoffX}
              y1={P.t}
              x2={cutoffX}
              y2={P.t + pH}
              stroke="rgba(115,120,144,0.45)"
              strokeWidth="1"
              strokeDasharray="4,3"
            />
            <rect
              x={cutoffX - 18}
              y={P.t + 3}
              width={36}
              height={14}
              rx="3"
              fill="var(--bg2)"
              stroke="var(--border)"
            />
            <text
              x={cutoffX}
              y={P.t + 13}
              textAnchor="middle"
              fill="var(--text2)"
              fontSize="11"
              fontFamily="'JetBrains Mono',monospace"
              fontWeight="600"
            >
              IS│OOS
            </text>
          </g>
        )}

        {highlightedDateRange && (() => {
          const startI = dates.findIndex(d => d >= highlightedDateRange.start)
          const endI = dates.findIndex(d => d >= highlightedDateRange.end)
          if (startI < 0) return null
          const x1 = toX(Math.max(0, startI - startIdx))
          const x2 = toX(Math.min(slice.length - 1, endI < 0 ? slice.length - 1 : endI - startIdx))
          return <rect x={x1} y={P.t} width={Math.max(x2 - x1, 2)} height={pH} fill="rgba(255,92,92,0.15)" clipPath="url(#cClip)" />
        })()}

        {tooltip &&
          (() => {
            const tipW = 128
            const tipH = 58
            const tx = tooltip.x + 10 + tipW > W ? tooltip.x - tipW - 10 : tooltip.x + 10
            const ty = Math.max(P.t, Math.min(P.t + pH - tipH, tooltip.y - tipH / 2))
            const r = parseFloat(tooltip.retPct)
            return (
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
                  r="4"
                  fill={lineColor}
                  stroke="#07080d"
                  strokeWidth="2"
                />
                <rect
                  x={tx}
                  y={ty}
                  width={tipW}
                  height={tipH}
                  rx="5"
                  fill="var(--surface)"
                  stroke="var(--border-h)"
                />
                <text
                  x={tx + 10}
                  y={ty + 15}
                  fill="var(--text2)"
                  fontSize="11"
                  fontFamily="'JetBrains Mono',monospace"
                >
                  {tooltip.date}
                </text>
                <text
                  x={tx + 10}
                  y={ty + 30}
                  fill="var(--text)"
                  fontSize="13"
                  fontFamily="'JetBrains Mono',monospace"
                  fontWeight="600"
                >
                  {tooltip.v.toFixed(2)}
                </text>
                <text
                  x={tx + 10}
                  y={ty + 47}
                  fill={r >= 0 ? '#00e49a' : '#ff5c5c'}
                  fontSize="11"
                  fontFamily="'JetBrains Mono',monospace"
                >
                  {r >= 0 ? '+' : ''}
                  {tooltip.retPct}%
                </text>
                <text
                  x={tx + tipW - 8}
                  y={ty + 15}
                  textAnchor="end"
                  fill={tooltip.isOOS ? '#737890' : '#00e49a'}
                  fontSize="11"
                  fontFamily="'JetBrains Mono',monospace"
                >
                  {tooltip.isOOS ? 'OOS' : 'IS'}
                </text>
              </g>
            )
          })()}
      </svg>
    </div>
  )
}
