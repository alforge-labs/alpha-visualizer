import { useCallback, useMemo } from 'react'
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

import { useChartTheme } from '../../design/useChartTheme'

export interface CompareSeries {
  id: string
  label: string
  values: number[]
  dates: string[]
  color: string
  isBaseline: boolean
}

interface CompareEquityVProps {
  series: CompareSeries[]
  height?: number
}

interface CrossPoint {
  date: Date
  /** 各 series の `values` 上の index（無効時は -1） */
  indices: number[]
}

const MARGIN = { top: 16, right: 24, bottom: 32, left: 64 }

/** 各 series の最初の値で正規化し %差し引き表記に */
function normalize(values: number[]): number[] {
  const base = values[0]
  if (base === undefined || base === 0) return values
  return values.map(v => (v / base - 1) * 100)
}

const bisectDate = bisector<Date, Date>(d => d).left

export function CompareEquityV({ series, height = 320 }: CompareEquityVProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <CompareEquityInner width={width} height={height} series={series} /> : null)}
    </ParentSize>
  )
}

function CompareEquityInner({
  width,
  height,
  series,
}: CompareEquityVProps & { width: number; height: number }) {
  const theme = useChartTheme()
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const seriesPrepared = useMemo(
    () =>
      series.map(s => ({
        ...s,
        normalized: normalize(s.values),
        parsedDates: s.dates.map(d => new Date(d)),
      })),
    [series],
  )

  // 共通の時間軸: 最も長い系列の日付列を使う
  const referenceSeries =
    seriesPrepared.reduce<typeof seriesPrepared[number] | null>(
      (longest, s) => (longest && longest.parsedDates.length >= s.parsedDates.length ? longest : s),
      null,
    ) ?? null

  const xDomain = useMemo<[Date, Date]>(() => {
    let min = Infinity
    let max = -Infinity
    for (const s of seriesPrepared) {
      for (const d of s.parsedDates) {
        const t = d.getTime()
        if (Number.isNaN(t)) continue
        if (t < min) min = t
        if (t > max) max = t
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const now = new Date()
      return [now, now]
    }
    return [new Date(min), new Date(max)]
  }, [seriesPrepared])

  const yDomain = useMemo<[number, number]>(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of seriesPrepared) {
      for (const v of s.normalized) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-1, 1]
    const pad = (hi - lo) * 0.06 || 1
    return [lo - pad, hi + pad]
  }, [seriesPrepared])

  const xScale = useMemo(
    () => scaleTime({ domain: xDomain, range: [0, innerW] }),
    [xDomain, innerW],
  )

  const yScale = useMemo(
    () => scaleLinear({ domain: yDomain, range: [innerH, 0], nice: true }),
    [yDomain, innerH],
  )

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<CrossPoint>()

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
      if (!referenceSeries) return
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      const x = lp.x - MARGIN.left
      const x0 = xScale.invert(x)
      const refIdx = bisectDate(referenceSeries.parsedDates, x0, 1)
      const a = referenceSeries.parsedDates[refIdx - 1]
      const b = referenceSeries.parsedDates[refIdx]
      const refDate = !a
        ? b
        : !b
          ? a
          : Math.abs(x0.getTime() - a.getTime()) <= Math.abs(b.getTime() - x0.getTime())
            ? a
            : b
      if (!refDate) return

      const indices = seriesPrepared.map(s => {
        const i = bisectDate(s.parsedDates, refDate, 1)
        const left = s.parsedDates[i - 1]
        const right = s.parsedDates[i]
        if (!left && !right) return -1
        if (!left) return i
        if (!right) return i - 1
        return Math.abs(refDate.getTime() - left.getTime()) <=
          Math.abs(right.getTime() - refDate.getTime())
          ? i - 1
          : i
      })

      showTooltip({
        tooltipData: { date: refDate, indices },
        tooltipLeft: xScale(refDate) + MARGIN.left,
        tooltipTop: 16,
      })
    },
    [referenceSeries, seriesPrepared, xScale, showTooltip],
  )

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Compare equity chart, ${seriesPrepared.length} strategies`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={theme.border}
            strokeDasharray="2,4"
            numTicks={5}
          />

          {/* baseline lines first, accent series last to keep on top */}
          {seriesPrepared.map(s => {
            const data = s.normalized.map((v, i) => ({
              date: s.parsedDates[i] ?? new Date(NaN),
              value: v,
            }))
            return (
              <LinePath
                key={s.id}
                data={data}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(d.value)}
                stroke={s.color}
                strokeWidth={s.isBaseline ? 2.5 : 1.75}
                strokeDasharray={s.isBaseline ? undefined : undefined}
                curve={curveMonotoneX}
                opacity={0.92}
              />
            )
          })}

          {/* zero baseline */}
          <Line
            from={{ x: 0, y: yScale(0) }}
            to={{ x: innerW, y: yScale(0) }}
            stroke={theme.text3}
            strokeWidth={1}
            strokeDasharray="3,4"
            opacity={0.5}
          />

          <AxisLeft
            scale={yScale}
            numTicks={5}
            stroke={theme.border}
            tickStroke={theme.border}
            tickFormat={(v) => `${(v as number).toFixed(0)}%`}
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
            numTicks={6}
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
                opacity={0.45}
                pointerEvents="none"
              />
              {tooltipData.indices.map((idx, i) => {
                if (idx < 0) return null
                const s = seriesPrepared[i]
                if (!s) return null
                const v = s.normalized[idx]
                if (v === undefined) return null
                return (
                  <circle
                    key={s.id}
                    cx={xScale(tooltipData.date)}
                    cy={yScale(v)}
                    r={4}
                    fill={s.color}
                    stroke={theme.surface}
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                )
              })}
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
            padding: '10px 12px',
            fontFamily: theme.mono,
            fontSize: 12,
            boxShadow: 'var(--shadow-2)',
            minWidth: 200,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: theme.text3, fontSize: 11 }}>
              {tooltipData.date.toISOString().slice(0, 10)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tooltipData.indices.map((idx, i) => {
                const s = seriesPrepared[i]
                if (!s || idx < 0) return null
                const v = s.normalized[idx]
                if (v === undefined) return null
                return (
                  <div
                    key={s.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.text2 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 2,
                          background: s.color,
                          borderRadius: 1,
                        }}
                      />
                      {s.label}
                    </span>
                    <span style={{ color: v >= 0 ? theme.success : theme.danger, fontWeight: 600 }}>
                      {v >= 0 ? '+' : ''}
                      {v.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}
