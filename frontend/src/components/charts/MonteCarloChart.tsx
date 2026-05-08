import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { LinePath, Line } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { curveMonotoneX } from '@visx/curve'

import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'
import { runMonteCarlo } from '../../lib/monteCarlo'

interface MonteCarloChartProps {
  trades: Trade[]
  lang: Lang
  compact: boolean
}

interface Pt {
  xi: number
  v: number
}

const N_SIM = 400
const MARGIN = { top: 16, right: 36, bottom: 32, left: 60 }

export function MonteCarloChart(props: MonteCarloChartProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <MonteCarloInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function MonteCarloInner({
  width,
  trades,
  lang,
  compact,
}: MonteCarloChartProps & { width: number }): React.ReactElement {
  const theme = useChartTheme()
  const L = makeL(lang)
  const n = trades.length

  const { pCurves, stats } = useMemo(() => {
    const rets = trades.map(t => t.return_pct / 100)
    const { xs, bands, finalStats } = runMonteCarlo({
      trades: rets,
      nSimulations: N_SIM,
      initialEquity: 100,
    })

    const out: Record<5 | 25 | 50 | 75 | 95, Pt[]> = {
      5: xs.map((xi, i) => ({ xi, v: bands.p5[i] ?? 0 })),
      25: xs.map((xi, i) => ({ xi, v: bands.p25[i] ?? 0 })),
      50: xs.map((xi, i) => ({ xi, v: bands.p50[i] ?? 0 })),
      75: xs.map((xi, i) => ({ xi, v: bands.p75[i] ?? 0 })),
      95: xs.map((xi, i) => ({ xi, v: bands.p95[i] ?? 0 })),
    }

    return { pCurves: out, stats: finalStats }
  }, [trades])

  const height = compact ? 240 : 300
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const allV = [...(pCurves[5] ?? []), ...(pCurves[95] ?? [])].map(d => d.v)
  const minV = (Math.min(...allV) || 90) * 0.97
  const maxV = (Math.max(...allV) || 110) * 1.03

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, Math.max(n, 1)], range: [0, innerW] }),
    [n, innerW],
  )
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [minV, maxV], range: [innerH, 0], nice: true }),
    [minV, maxV, innerH],
  )

  const success = theme.success || '#4F7A3F'
  const successFaint = `color-mix(in srgb, ${success} 18%, transparent)`
  const successSoft = `color-mix(in srgb, ${success} 8%, transparent)`

  const statRows: ReadonlyArray<readonly [string, string, string]> = [
    [
      L('中央値リターン', 'Median return'),
      `${((stats.p50 / 100 - 1) * 100).toFixed(1)}%`,
      stats.p50 >= 100 ? theme.success : theme.danger,
    ],
    [L('最良 95%ile', 'Best 95%ile'), `${((stats.p95 / 100 - 1) * 100).toFixed(1)}%`, theme.success],
    [
      L('最悪 5%ile', 'Worst 5%ile'),
      `${((stats.p5 / 100 - 1) * 100).toFixed(1)}%`,
      stats.p5 < 100 ? theme.danger : theme.warn,
    ],
    [
      L('損失確率', 'Loss prob.'),
      `${stats.lossProb.toFixed(1)}%`,
      stats.lossProb > 30 ? theme.danger : theme.warn,
    ],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          gap: 28,
          flexWrap: 'wrap',
          paddingLeft: MARGIN.left,
        }}
      >
        {statRows.map(([lbl, val, col], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-caption)',
                fontWeight: 500,
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-caption)',
                textTransform: 'uppercase',
              }}
            >
              {lbl}
            </span>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontSize: '1.5rem',
                fontWeight: 600,
                color: col,
                letterSpacing: 'var(--tracking-display)',
                lineHeight: 1.05,
              }}
            >
              {val}
            </span>
          </div>
        ))}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text2)',
            letterSpacing: 'var(--tracking-mono)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 6, background: successSoft, borderRadius: 2 }} />
            90% CI
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 6, background: successFaint, borderRadius: 2 }} />
            50% CI
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: success, borderRadius: 1 }} />
            {L('中央値', 'Median')}
          </span>
        </div>
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Monte Carlo equity bands, ${N_SIM} simulations`}
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

          <BandPath
            upper={pCurves[95] ?? []}
            lower={pCurves[5] ?? []}
            xScale={xScale}
            yScale={yScale}
            fill={successSoft}
          />
          <BandPath
            upper={pCurves[75] ?? []}
            lower={pCurves[25] ?? []}
            xScale={xScale}
            yScale={yScale}
            fill={successFaint}
          />

          {/* baseline 100 */}
          <Line
            from={{ x: 0, y: yScale(100) }}
            to={{ x: innerW, y: yScale(100) }}
            stroke={theme.text3}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
          />

          {/* percentile lines */}
          {([95, 75, 25, 5] as const).map(p => {
            const data = pCurves[p] ?? []
            return (
              <LinePath
                key={p}
                data={data}
                x={(d) => xScale(d.xi)}
                y={(d) => yScale(d.v)}
                stroke={success}
                strokeOpacity={p === 95 || p === 5 ? 0.32 : 0.55}
                strokeWidth={1}
                curve={curveMonotoneX}
              />
            )
          })}

          {/* median */}
          <LinePath
            data={pCurves[50] ?? []}
            x={(d) => xScale(d.xi)}
            y={(d) => yScale(d.v)}
            stroke={success}
            strokeWidth={2.25}
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
            numTicks={5}
            stroke={theme.border}
            tickStroke={theme.border}
            tickFormat={(v) => `${Math.round(v as number)}`}
            tickLabelProps={() => ({
              fill: theme.text3,
              fontFamily: theme.mono,
              fontSize: 11,
              textAnchor: 'middle',
              dy: '0.5em',
            })}
            hideAxisLine
          />

          {/* end labels */}
          {([95, 50, 5] as const).map(p => {
            const pts = pCurves[p] ?? []
            const last = pts[pts.length - 1]
            if (!last) return null
            return (
              <text
                key={p}
                x={xScale(last.xi) + 6}
                y={yScale(last.v) + 4}
                fontSize={11}
                fontFamily={theme.mono}
                fill={theme.text2}
              >
                {p}%
              </text>
            )
          })}
        </Group>
      </svg>

      <div
        style={{
          paddingLeft: MARGIN.left,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-mono)',
        }}
      >
        {N_SIM}
        {L(
          ' シミュレーション · トレードをランダムリサンプリング（シード固定）',
          ' simulations · random resampling of trades (fixed seed)',
        )}
      </div>
    </div>
  )
}

interface BandPathProps {
  upper: Pt[]
  lower: Pt[]
  xScale: (n: number) => number
  yScale: (n: number) => number
  fill: string
}

function BandPath({ upper, lower, xScale, yScale, fill }: BandPathProps): React.ReactElement | null {
  if (upper.length === 0 || lower.length === 0) return null
  const upperD = upper
    .map((u, i) => `${i === 0 ? 'M' : 'L'}${xScale(u.xi)},${yScale(u.v)}`)
    .join('')
  const lowerD = [...lower]
    .reverse()
    .map(l => `L${xScale(l.xi)},${yScale(l.v)}`)
    .join('')
  return <path d={`${upperD}${lowerD}Z`} fill={fill} />
}
