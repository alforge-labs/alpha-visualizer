import { useCallback, useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { LinePath, AreaClosed, Bar, Line } from '@visx/shape'
import { scaleLinear, scaleTime } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { LinearGradient } from '@visx/gradient'
import { curveMonotoneX } from '@visx/curve'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { localPoint } from '@visx/event'
import { bisector } from 'd3-array'

import { RANGES } from '../../contexts/dashboardConstants'
import { useChartTheme } from '../../design/useChartTheme'
import { useEquityViewport, type EquityViewportPoint } from '../../hooks/useEquityViewport'
import { buildRegimeBands, type RegimeBand } from './regimeBands'

interface RegimeSeriesInput {
  states: number[]
  n_states: number
  label_names?: Record<string, string>
}

interface EquityChartVProps {
  equity: number[]
  dates: string[]
  isCutoffIdx: number
  benchmark?: number[]
  showBenchmark?: boolean
  compact?: boolean
  highlightedDateRange?: { start: string; end: string } | null
  regimeSeries?: RegimeSeriesInput
  showRegime?: boolean
}

type Point = EquityViewportPoint

function regimeColor(state: number, n: number, palette: readonly string[]): string {
  const c = palette[state]
  if (state >= 0 && state < palette.length && c) return c
  const safeN = Math.max(n, 1)
  return `hsl(${(state * 360) / safeN}, 55%, 55%)`
}

function regimeLabel(state: number, names?: Record<string, string>): string {
  return names?.[String(state)] ?? `S${state}`
}

const MARGIN = { top: 20, right: 24, bottom: 32, left: 64 }
const COMPACT_MARGIN = { top: 16, right: 20, bottom: 24, left: 56 }

const bisectDate = bisector<Point, Date>((d) => d.date).left

export function EquityChartV(props: EquityChartVProps) {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <EquityChartInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function EquityChartInner({
  width,
  equity,
  dates,
  isCutoffIdx,
  benchmark,
  showBenchmark = false,
  compact = false,
  highlightedDateRange,
  regimeSeries,
  showRegime = false,
}: EquityChartVProps & { width: number }) {
  const theme = useChartTheme()

  const margin = compact ? COMPACT_MARGIN : MARGIN
  const height = compact ? 200 : 280
  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const { range, setRange, points, startIdx } = useEquityViewport({ equity, dates, benchmark })

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [points[0]?.date ?? new Date(), points[points.length - 1]?.date ?? new Date()],
        range: [0, innerW],
      }),
    [points, innerW]
  )

  const yScale = useMemo(() => {
    const vals = points.map((p) => p.value)
    if (showBenchmark) {
      points.forEach((p) => {
        if (p.benchmark != null) vals.push(p.benchmark)
      })
    }
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.06 || 1
    return scaleLinear({
      domain: [lo - pad, hi + pad],
      range: [innerH, 0],
      nice: true,
    })
  }, [points, showBenchmark, innerH])

  const last = points[points.length - 1]?.value ?? 0
  const first = points[0]?.value ?? 0
  const isPos = last >= first
  const lineColor = isPos ? theme.success : theme.danger

  const cutoffPoint = useMemo(() => {
    const visible = isCutoffIdx - startIdx
    if (visible <= 0 || visible >= points.length - 1) return null
    return points[visible] ?? null
  }, [points, startIdx, isCutoffIdx])

  const cutoffX = cutoffPoint ? xScale(cutoffPoint.date) : null

  const highlightRect = useMemo(() => {
    if (!highlightedDateRange) return null
    const s = new Date(highlightedDateRange.start)
    const e = new Date(highlightedDateRange.end)
    const x1 = xScale(s)
    const x2 = xScale(e)
    if (Number.isNaN(x1) || Number.isNaN(x2)) return null
    return { x: Math.min(x1, x2), w: Math.max(2, Math.abs(x2 - x1)) }
  }, [highlightedDateRange, xScale])

  const regimeBands = useMemo<RegimeBand[]>(() => {
    if (!regimeSeries || !showRegime) return []
    return buildRegimeBands(regimeSeries.states)
  }, [regimeSeries, showRegime])

  const regimeRects = useMemo(() => {
    if (regimeBands.length === 0 || points.length === 0) return []
    const lastPoint = points[points.length - 1]
    if (!lastPoint) return []
    const lastVisibleIdx = lastPoint.origIdx
    const out: Array<{ key: string; x: number; w: number; state: number }> = []
    regimeBands.forEach((b, i) => {
      if (b.endIdx < startIdx || b.startIdx > lastVisibleIdx) return
      const sLocal = Math.max(b.startIdx - startIdx, 0)
      const eLocal = Math.min(b.endIdx - startIdx, points.length - 1)
      const sp = points[sLocal]
      const ep = points[eLocal]
      if (!sp || !ep) return
      const xA = xScale(sp.date)
      const xB = xScale(ep.date)
      const x = Math.min(xA, xB)
      const w = Math.max(2, Math.abs(xB - xA))
      out.push({ key: `reg-${i}-${b.state}`, x, w, state: b.state })
    })
    return out
  }, [regimeBands, points, startIdx, xScale])

  const regimeLegend = useMemo(() => {
    if (!regimeSeries || !showRegime) return [] as Array<{ state: number; label: string }>
    const seen = new Set<number>()
    const out: Array<{ state: number; label: string }> = []
    for (const s of regimeSeries.states) {
      if (seen.has(s)) continue
      seen.add(s)
      out.push({ state: s, label: regimeLabel(s, regimeSeries.label_names) })
    }
    return out.sort((a, b) => a.state - b.state)
  }, [regimeSeries, showRegime])

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<Point>()

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      const x = lp.x - margin.left
      const x0 = xScale.invert(x)
      const idx = bisectDate(points, x0, 1)
      const a = points[idx - 1]
      const b = points[idx]
      if (!a) return
      const p = !b
        ? a
        : Math.abs(x0.getTime() - a.date.getTime()) <= Math.abs(b.date.getTime() - x0.getTime())
          ? a
          : b
      showTooltip({
        tooltipData: p,
        tooltipLeft: xScale(p.date) + margin.left,
        tooltipTop: yScale(p.value) + margin.top,
      })
    },
    [points, xScale, yScale, margin, showTooltip]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: margin.left,
          flexWrap: 'wrap',
        }}
      >
        {RANGES.map((r) => {
          const active = r === range
          return (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                height: 24,
                padding: '0 10px',
                background: active ? 'var(--accent-bg)' : 'transparent',
                border: active ? '1px solid var(--accent-glow)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                fontWeight: 600,
                letterSpacing: 'var(--tracking-mono)',
                color: active ? 'var(--accent)' : 'var(--text3)',
                transition: 'all var(--motion-fast)',
              }}
            >
              {r}
            </button>
          )
        })}
        {showBenchmark && (
          <div
            style={{
              marginLeft: 12,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
            }}
          >
            <span style={{ color: theme.accent }}>━━ Strategy</span>
            <span>╌╌ Buy &amp; Hold</span>
          </div>
        )}
        {regimeLegend.length > 0 && (
          <div
            style={{
              marginLeft: 12,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              flexWrap: 'wrap',
            }}
            aria-label="Regime legend"
          >
            {regimeLegend.map((item) => (
              <span
                key={`legend-${item.state}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: regimeColor(
                      item.state,
                      regimeSeries?.n_states ?? regimeLegend.length,
                      theme.series,
                    ),
                    opacity: 0.7,
                    borderRadius: 2,
                    display: 'inline-block',
                  }}
                />
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Equity chart, ${points.length} points`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <LinearGradient
          id="eqV-fill"
          from={lineColor}
          to={lineColor}
          fromOpacity={0.22}
          toOpacity={0.02}
        />
        <Group left={margin.left} top={margin.top}>
          {/* regime bands (under IS shading) */}
          {regimeRects.map((r) => (
            <rect
              key={r.key}
              x={r.x}
              y={0}
              width={r.w}
              height={innerH}
              fill={regimeColor(r.state, regimeSeries?.n_states ?? 1, theme.series)}
              opacity={0.18}
              pointerEvents="none"
            />
          ))}

          {/* IS shading */}
          {cutoffX != null && (
            <rect
              x={0}
              y={0}
              width={cutoffX}
              height={innerH}
              fill={theme.accentBg}
              opacity={0.35}
            />
          )}

          {/* highlight range */}
          {highlightRect && (
            <rect
              x={highlightRect.x}
              y={0}
              width={highlightRect.w}
              height={innerH}
              fill={theme.danger}
              opacity={0.14}
            />
          )}

          <GridRows
            scale={yScale}
            width={innerW}
            stroke={theme.border}
            strokeDasharray="2,4"
            numTicks={compact ? 3 : 5}
          />

          {showBenchmark && (
            <LinePath
              data={points.filter((p) => p.benchmark != null) as Array<Required<Point>>}
              x={(d) => xScale(d.date)}
              y={(d) => yScale(d.benchmark as number)}
              stroke={theme.text3}
              strokeWidth={1.5}
              strokeDasharray="4,4"
              curve={curveMonotoneX}
            />
          )}

          <AreaClosed
            data={points}
            x={(d) => xScale(d.date)}
            y={(d) => yScale(d.value)}
            yScale={yScale}
            fill="url(#eqV-fill)"
            curve={curveMonotoneX}
          />
          <LinePath
            data={points}
            x={(d) => xScale(d.date)}
            y={(d) => yScale(d.value)}
            stroke={lineColor}
            strokeWidth={2}
            curve={curveMonotoneX}
          />

          {cutoffX != null && (
            <>
              <Line
                from={{ x: cutoffX, y: 0 }}
                to={{ x: cutoffX, y: innerH }}
                stroke={theme.text3}
                strokeWidth={1}
                strokeDasharray="4,3"
                opacity={0.6}
              />
              <rect
                x={cutoffX - 22}
                y={4}
                width={44}
                height={16}
                rx={3}
                fill={theme.bg2}
                stroke={theme.border}
              />
              <text
                x={cutoffX}
                y={15}
                textAnchor="middle"
                fontFamily={theme.mono}
                fontSize={11}
                fontWeight={600}
                fill={theme.text2}
              >
                IS │ OOS
              </text>
            </>
          )}

          <AxisLeft
            scale={yScale}
            numTicks={compact ? 3 : 5}
            stroke={theme.border}
            tickStroke={theme.border}
            tickLabelProps={() => ({
              fill: theme.text3,
              fontFamily: theme.mono,
              fontSize: 11,
              textAnchor: 'end',
              dx: '-0.4em',
              dy: '0.32em',
            })}
            hideAxisLine
          />
          <AxisBottom
            top={innerH}
            scale={xScale}
            numTicks={compact ? 4 : 6}
            stroke={theme.border}
            tickStroke={theme.border}
            tickLabelProps={() => ({
              fill: theme.text3,
              fontFamily: theme.mono,
              fontSize: 11,
              textAnchor: 'middle',
              dy: '0.5em',
            })}
            hideAxisLine
          />

          {tooltipData && (
            <>
              <Line
                from={{ x: xScale(tooltipData.date), y: 0 }}
                to={{ x: xScale(tooltipData.date), y: innerH }}
                stroke={theme.text3}
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.5}
                pointerEvents="none"
              />
              <circle
                cx={xScale(tooltipData.date)}
                cy={yScale(tooltipData.value)}
                r={5}
                fill={lineColor}
                stroke={theme.surface}
                strokeWidth={2}
                pointerEvents="none"
              />
            </>
          )}

          {/* invisible mouse-capture overlay */}
          <Bar
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onTouchMove={handleMove}
            onMouseLeave={hideTooltip}
            onTouchEnd={hideTooltip}
          />
        </Group>
      </svg>

      {tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: theme.surface,
            border: `1px solid ${theme.borderStrong}`,
            color: theme.text,
            borderRadius: 8,
            padding: '8px 12px',
            fontFamily: theme.mono,
            fontSize: 12,
            boxShadow: 'var(--shadow-2)',
          }}
        >
          {(() => {
            const fst = points[0]?.value ?? tooltipData.value
            const ret = ((tooltipData.value / fst - 1) * 100).toFixed(2)
            const isOOS = tooltipData.origIdx >= isCutoffIdx
            const dateStr = tooltipData.date.toISOString().slice(0, 10)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ color: theme.text3, fontSize: 11 }}>{dateStr}</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: theme.text }}>
                  {tooltipData.value.toFixed(2)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: parseFloat(ret) >= 0 ? theme.success : theme.danger,
                  }}
                >
                  {parseFloat(ret) >= 0 ? '+' : ''}
                  {ret}%
                </span>
                <span style={{ fontSize: 10, color: isOOS ? theme.text3 : theme.success }}>
                  {isOOS ? 'OOS' : 'IS'}
                </span>
              </div>
            )
          })()}
        </TooltipWithBounds>
      )}
    </div>
  )
}
