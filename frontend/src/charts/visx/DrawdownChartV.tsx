import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { AreaClosed, LinePath, Line } from '@visx/shape'
import { scaleLinear, scaleTime } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { LinearGradient } from '@visx/gradient'
import { curveMonotoneX } from '@visx/curve'
import { useChartTheme } from '../../design/useChartTheme'

interface DrawdownChartVProps {
  dd: number[]
  dates: string[]
  isCutoffIdx: number
  compact?: boolean
}

interface Point {
  date: Date
  value: number
}

const MARGIN = { top: 16, right: 24, bottom: 28, left: 64 }
const COMPACT_MARGIN = { top: 12, right: 20, bottom: 22, left: 56 }

export function DrawdownChartV(props: DrawdownChartVProps) {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <Inner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function Inner({ width, dd, dates, isCutoffIdx, compact = false }: DrawdownChartVProps & { width: number }) {
  const theme = useChartTheme()
  const margin = compact ? COMPACT_MARGIN : MARGIN
  const height = compact ? 140 : 180
  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const points: Point[] = useMemo(
    () => dd.map((v, i) => ({ date: new Date(dates[i] ?? ''), value: v })),
    [dd, dates]
  )

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [points[0]?.date ?? new Date(), points[points.length - 1]?.date ?? new Date()],
        range: [0, innerW],
      }),
    [points, innerW]
  )

  const yScale = useMemo(() => {
    const lo = Math.min(...dd, 0)
    return scaleLinear({
      domain: [lo * 1.06, 0],
      range: [innerH, 0],
      nice: true,
    })
  }, [dd, innerH])

  const cutoffX = useMemo(() => {
    if (isCutoffIdx <= 0 || isCutoffIdx >= points.length - 1) return null
    const p = points[isCutoffIdx]
    if (!p) return null
    return xScale(p.date)
  }, [isCutoffIdx, points, xScale])

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Drawdown chart, ${points.length} points`}
      style={{ display: 'block' }}
    >
      <LinearGradient
        id="ddV-fill"
        from={theme.danger}
        to={theme.danger}
        fromOpacity={0.32}
        toOpacity={0.04}
      />
      <Group left={margin.left} top={margin.top}>
        {cutoffX != null && (
          <rect x={0} y={0} width={cutoffX} height={innerH} fill={theme.accentBg} opacity={0.3} />
        )}

        <GridRows
          scale={yScale}
          width={innerW}
          stroke={theme.border}
          strokeDasharray="2,4"
          numTicks={compact ? 3 : 4}
        />

        <AreaClosed
          data={points}
          x={(d) => xScale(d.date)}
          y={(d) => yScale(d.value)}
          yScale={yScale}
          fill="url(#ddV-fill)"
          curve={curveMonotoneX}
        />
        <LinePath
          data={points}
          x={(d) => xScale(d.date)}
          y={(d) => yScale(d.value)}
          stroke={theme.danger}
          strokeWidth={1.5}
          curve={curveMonotoneX}
        />

        {cutoffX != null && (
          <Line
            from={{ x: cutoffX, y: 0 }}
            to={{ x: cutoffX, y: innerH }}
            stroke={theme.text3}
            strokeWidth={1}
            strokeDasharray="4,3"
            opacity={0.6}
          />
        )}

        <AxisLeft
          scale={yScale}
          numTicks={compact ? 3 : 4}
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
      </Group>
    </svg>
  )
}
