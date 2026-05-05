import { useCallback, useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { LinePath, Bar, Line } from '@visx/shape'
import { scaleLinear, scaleTime } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { curveMonotoneX } from '@visx/curve'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { localPoint } from '@visx/event'
import { bisector } from 'd3-array'

import { useDashboard, RANGE_N } from '../../contexts/DashboardContext'
import { useChartTheme } from '../../design/useChartTheme'

interface Props {
  dailyReturns: number[]
  dates: string[]
  compact?: boolean
}

const WINDOWS = [30, 60, 90] as const
type WindowOption = (typeof WINDOWS)[number]

interface Point {
  date: Date
  value: number
}

const bisectDate = bisector<Point, Date>(d => d.date).left

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

export function RollingMetricsChart(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <RollingMetricsInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function RollingMetricsInner({
  width,
  dailyReturns,
  dates,
  compact = false,
}: Props & { width: number }) {
  const { selectedRange } = useDashboard()
  const theme = useChartTheme()
  const [win, setWin] = useState<WindowOption>(60)

  const height = compact ? 200 : 240
  const margin = useMemo(
    () =>
      compact
        ? { top: 12, right: 24, bottom: 24, left: 56 }
        : { top: 16, right: 24, bottom: 32, left: 60 },
    [compact],
  )
  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const points = useMemo<Point[]>(() => {
    const n = dailyReturns.length
    const bars = Math.min(RANGE_N[selectedRange], n)
    const start = Math.max(0, n - bars)
    const sharpe = computeRollingSharpe(dailyReturns, win)
    const result: Point[] = []
    for (let i = start; i < sharpe.length; i++) {
      const v = sharpe[i]
      if (v == null) continue
      const date = new Date(dates[i + 1] ?? dates[i] ?? '')
      if (Number.isNaN(date.getTime())) continue
      result.push({ date, value: v })
    }
    return result
  }, [dailyReturns, dates, selectedRange, win])

  const xDomain = useMemo<[Date, Date]>(() => {
    if (points.length === 0) {
      const now = new Date()
      return [now, now]
    }
    return [points[0]!.date, points[points.length - 1]!.date]
  }, [points])

  const yDomain = useMemo<[number, number]>(() => {
    if (points.length === 0) return [-1, 1]
    const vs = points.map(p => p.value)
    const lo = Math.min(...vs, -1)
    const hi = Math.max(...vs, 1)
    return [lo, hi]
  }, [points])

  const xScale = useMemo(
    () => scaleTime({ domain: xDomain, range: [0, innerW] }),
    [xDomain, innerW],
  )

  const yScale = useMemo(
    () => scaleLinear({ domain: yDomain, range: [innerH, 0], nice: true }),
    [yDomain, innerH],
  )

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<Point>()

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
      if (points.length === 0) return
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      const x = lp.x - margin.left
      const x0 = xScale.invert(x)
      const idx = bisectDate(points, x0, 1)
      const a = points[idx - 1]
      const b = points[idx]
      const p = !b
        ? a
        : !a
          ? b
          : Math.abs(x0.getTime() - a.date.getTime()) <= Math.abs(b.date.getTime() - x0.getTime())
            ? a
            : b
      if (!p) return
      showTooltip({
        tooltipData: p,
        tooltipLeft: xScale(p.date) + margin.left,
        tooltipTop: yScale(p.value) + margin.top,
      })
    },
    [points, xScale, yScale, margin, showTooltip],
  )

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {WINDOWS.map(w => {
          const active = w === win
          return (
            <button
              key={w}
              type="button"
              onClick={() => setWin(w)}
              style={{
                height: 24,
                padding: '0 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                fontWeight: 600,
                letterSpacing: 'var(--tracking-mono)',
                background: active ? 'var(--accent-bg)' : 'transparent',
                border: active ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
                color: active ? 'var(--accent)' : 'var(--text3)',
                transition: 'all var(--motion-fast)',
              }}
            >
              {w}d
            </button>
          )
        })}
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Rolling Sharpe (${win}-day window), ${points.length} points`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={theme.border}
            strokeDasharray="2,4"
            numTicks={5}
          />

          <Line
            from={{ x: 0, y: yScale(0) }}
            to={{ x: innerW, y: yScale(0) }}
            stroke={theme.text3}
            strokeWidth={1}
            strokeDasharray="3,4"
            opacity={0.6}
          />

          <LinePath
            data={points}
            x={(d) => xScale(d.date)}
            y={(d) => yScale(d.value)}
            stroke={theme.accent}
            strokeWidth={1.75}
            curve={curveMonotoneX}
          />

          <AxisLeft
            scale={yScale}
            numTicks={5}
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
                r={4}
                fill={theme.accent}
                stroke={theme.surface}
                strokeWidth={1.5}
                pointerEvents="none"
              />
            </>
          )}

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
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ color: theme.text3, fontSize: 11 }}>
              {tooltipData.date.toISOString().slice(0, 10)}
            </span>
            <span style={{ fontWeight: 600 }}>
              Sharpe ({win}d):{' '}
              <span style={{ color: tooltipData.value >= 0 ? theme.success : theme.danger }}>
                {tooltipData.value.toFixed(3)}
              </span>
            </span>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}
