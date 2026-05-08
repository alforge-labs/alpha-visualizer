import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar, LinePath, Line } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { curveBasis } from '@visx/curve'
import { useDashboard, RANGE_N } from '../../contexts/DashboardContext'
import { useChartTheme } from '../../design/useChartTheme'
import {
  computeHistogram,
  mean,
  normalPdf,
  sampleStd,
} from '../../lib/distribution'

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

// バケット型は lib/distribution.ts の HistogramBucket を直接推論する。

const MARGIN = { top: 24, right: 24, bottom: 36, left: 56 }
const BIN_COUNT = 40

// 計算ロジックは lib/distribution.ts の純関数に委譲（ADR-0002）。

export function ReturnDistributionChart(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <ReturnDistributionInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function ReturnDistributionInner({
  width,
  datasets,
  var95,
  skewness,
  excessKurtosis,
  compact = false,
}: Props & { width: number }): React.ReactElement | null {
  const { selectedRange } = useDashboard()
  const theme = useChartTheme()

  const height = compact ? 220 : 280
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const primary = datasets[0]
  const returns = useMemo(() => {
    if (!primary) return []
    const n = primary.returns.length
    const bars = Math.min(RANGE_N[selectedRange], n)
    return primary.returns.slice(Math.max(0, n - bars))
  }, [primary, selectedRange])

  const buckets = useMemo(() => computeHistogram(returns, { binCount: BIN_COUNT }), [returns])

  const xDomain = useMemo<[number, number]>(() => {
    if (buckets.length === 0) return [-3, 3]
    const lo = Math.min(...buckets.map(b => b.x - b.width / 2), -3)
    const hi = Math.max(...buckets.map(b => b.x + b.width / 2), 3)
    return [lo, hi]
  }, [buckets])

  const maxCount = Math.max(...buckets.map(b => b.count), 1)

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: xDomain, range: [0, innerW] }),
    [xDomain, innerW],
  )
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, maxCount], range: [innerH, 0], nice: true }),
    [maxCount, innerH],
  )

  const stats = useMemo(() => {
    if (returns.length === 0) return { mean: 0, std: 1 }
    return { mean: mean(returns), std: sampleStd(returns) || 1 }
  }, [returns])

  const normalCurve = useMemo(() => {
    if (returns.length === 0 || buckets.length === 0) return []
    const steps = 100
    const [lo, hi] = xDomain
    const step = (hi - lo) / steps
    const binWidth = buckets[0]?.width ?? 0.1
    const points: { x: number; y: number }[] = []
    for (let i = 0; i <= steps; i++) {
      const x = lo + i * step
      const density = normalPdf(x, stats.mean, stats.std)
      const scaled = density * returns.length * binWidth
      points.push({ x, y: scaled })
    }
    return points
  }, [returns.length, xDomain, stats, buckets])

  if (!primary) return null

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Return distribution histogram, ${returns.length} samples`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <Group left={MARGIN.left} top={MARGIN.top}>
        <GridRows
          scale={yScale}
          width={innerW}
          stroke={theme.border}
          strokeDasharray="2,4"
          numTicks={4}
        />

        {buckets.map((b, i) => {
          const x = xScale(b.x - b.width / 2)
          const w = Math.max(xScale(b.x + b.width / 2) - x - 1, 1)
          const y = yScale(b.count)
          const h = innerH - y
          const isLeft = b.x < 0
          return (
            <Bar
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isLeft ? theme.danger : theme.success}
              opacity={0.55}
            />
          )
        })}

        {/* normal pdf overlay */}
        <LinePath
          data={normalCurve}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          stroke={theme.text3}
          strokeWidth={1.25}
          strokeDasharray="3,3"
          curve={curveBasis}
        />

        {/* x = 0 ライン */}
        <Line
          from={{ x: xScale(0), y: 0 }}
          to={{ x: xScale(0), y: innerH }}
          stroke={theme.text3}
          strokeWidth={0.75}
          opacity={0.6}
        />

        {/* VaR ライン */}
        {var95 != null && (
          <>
            <Line
              from={{ x: xScale(-var95), y: 0 }}
              to={{ x: xScale(-var95), y: innerH }}
              stroke={theme.danger}
              strokeWidth={1.5}
              strokeDasharray="4,2"
            />
            <text
              x={xScale(-var95) - 4}
              y={12}
              textAnchor="end"
              fontSize={11}
              fontFamily={theme.mono}
              fill={theme.danger}
            >
              VaR95
            </text>
          </>
        )}

        <AxisBottom
          top={innerH}
          scale={xScale}
          numTicks={6}
          stroke={theme.border}
          tickStroke={theme.border}
          tickFormat={(v) => `${(v as number).toFixed(0)}%`}
          tickLabelProps={() => ({
            fill: theme.text3,
            fontFamily: theme.mono,
            fontSize: 11,
            textAnchor: 'middle',
            dy: '0.5em',
          })}
          hideAxisLine
        />

        {skewness != null && (
          <text
            x={innerW - 4}
            y={14}
            textAnchor="end"
            fontSize={11}
            fontFamily={theme.mono}
            fill={theme.text3}
          >
            {`skew ${skewness.toFixed(2)} · kurt ${(excessKurtosis ?? 0).toFixed(2)}`}
          </text>
        )}
      </Group>
    </svg>
  )
}
