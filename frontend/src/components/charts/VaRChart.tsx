import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar, Line } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { useDashboard, RANGE_N } from '../../contexts/DashboardContext'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { useChartTheme } from '../../design/useChartTheme'

interface Props {
  dailyReturns: number[]
  var95: number
  cvar95: number
  lang: Lang
}

const HEIGHT = 220
const MARGIN = { top: 16, right: 24, bottom: 36, left: 56 }
const BINS = 40

interface Bucket {
  x: number
  count: number
  width: number
  isTail: boolean
}

export function VaRChart(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <VaRChartInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function VaRChartInner({
  width,
  dailyReturns,
  var95,
  cvar95,
  lang,
}: Props & { width: number }): React.ReactElement {
  const { selectedRange } = useDashboard()
  const theme = useChartTheme()
  const L = makeL(lang)

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, HEIGHT - MARGIN.top - MARGIN.bottom)

  const returns = useMemo(() => {
    const n = dailyReturns.length
    const bars = Math.min(RANGE_N[selectedRange], n)
    return dailyReturns.slice(Math.max(0, n - bars))
  }, [dailyReturns, selectedRange])

  const buckets = useMemo<Bucket[]>(() => {
    if (returns.length === 0) return []
    const minX = Math.min(...returns, -0.5)
    const maxX = Math.min(Math.max(...returns, 0), 0)
    const binW = (maxX - minX) / BINS || 0.01
    const counts = new Array(BINS).fill(0) as number[]
    for (const v of returns) {
      const idx = Math.min(Math.floor((v - minX) / binW), BINS - 1)
      if (idx >= 0) counts[idx] = (counts[idx] ?? 0) + 1
    }
    return counts.map((count, i) => {
      const center = minX + (i + 0.5) * binW
      return { x: center, count, width: binW, isTail: center < -var95 }
    })
  }, [returns, var95])

  const xDomain = useMemo<[number, number]>(() => {
    if (buckets.length === 0) return [-3, 0]
    const lo = Math.min(...buckets.map(b => b.x - b.width / 2), -var95 - 0.5)
    const hi = Math.max(...buckets.map(b => b.x + b.width / 2), 0)
    return [lo, hi]
  }, [buckets, var95])

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: xDomain, range: [0, innerW] }),
    [xDomain, innerW],
  )

  const maxCount = Math.max(...buckets.map(b => b.count), 1)
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, maxCount], range: [innerH, 0], nice: true }),
    [maxCount, innerH],
  )

  const danger = theme.danger || '#B33A2F'
  const warn = theme.warn || '#B27A1F'

  return (
    <div>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`VaR distribution histogram, VaR95 ${var95.toFixed(2)}%, CVaR95 ${cvar95.toFixed(2)}%`}
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
            return (
              <Bar
                key={i}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={danger}
                opacity={b.isTail ? 0.8 : 0.32}
              />
            )
          })}

          {/* VaR line */}
          <Line
            from={{ x: xScale(-var95), y: 0 }}
            to={{ x: xScale(-var95), y: innerH }}
            stroke={danger}
            strokeWidth={1.75}
          />
          <text
            x={xScale(-var95) - 6}
            y={12}
            textAnchor="end"
            fontSize={11}
            fontFamily={theme.mono}
            fill={danger}
          >
            VaR95 {var95.toFixed(2)}%
          </text>

          {/* CVaR line */}
          {cvar95 > var95 && (
            <>
              <Line
                from={{ x: xScale(-cvar95), y: 0 }}
                to={{ x: xScale(-cvar95), y: innerH }}
                stroke={warn}
                strokeWidth={1.75}
                strokeDasharray="4,2"
              />
              <text
                x={xScale(-cvar95) - 6}
                y={26}
                textAnchor="end"
                fontSize={11}
                fontFamily={theme.mono}
                fill={warn}
              >
                CVaR95 {cvar95.toFixed(2)}%
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
        </Group>
      </svg>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-mono)',
          marginTop: 6,
        }}
      >
        {L(
          `5%の確率で1日あたり ${var95.toFixed(2)}% 以上の損失（VaR95）。テール期待損失は ${cvar95.toFixed(2)}%（CVaR95）。`,
          `5% chance of losing more than ${var95.toFixed(2)}% per day (VaR95). Expected tail loss: ${cvar95.toFixed(2)}% (CVaR95).`,
        )}
      </div>
    </div>
  )
}
