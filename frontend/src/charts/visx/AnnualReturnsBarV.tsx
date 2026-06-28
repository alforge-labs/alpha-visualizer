import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar, Line } from '@visx/shape'
import { scaleBand, scaleLinear } from '@visx/scale'
import { useChartTheme } from '../../design/useChartTheme'

/** Container から渡される 1 年ぶんの整形済みデータ。 */
export interface AnnualReturnsPoint {
  year: string
  strategy: number
  /** ベンチマーク値（無ければ null）。null の場合 benchmark バーは描画しない。 */
  benchmark: number | null
}

export interface AnnualReturnsBarVProps {
  points: AnnualReturnsPoint[]
  /** 凡例ラベル: 戦略 / Buy & Hold */
  labels: { strategy: string; benchmark: string }
  /** ホバー時 tooltip ラベル: 戦略 / B&H */
  tooltipLabels: { strategy: string; benchmark: string }
  height?: number
  compact?: boolean
}

interface HoverInfo {
  year: string
  strategy: number
  benchmark?: number
}

const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 }

/**
 * 年次リターン棒グラフ (Presentational)。
 *
 * Container 側で annualReturns / benchmarkReturns dict から整形済みの
 * 年別ポイント列に変換したあと、visx で描画する。
 */
export function AnnualReturnsBarV(props: AnnualReturnsBarVProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <Inner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function Inner({
  width,
  points,
  labels,
  tooltipLabels,
  height: heightOverride,
  compact = false,
}: AnnualReturnsBarVProps & { width: number }): React.ReactElement {
  const theme = useChartTheme()
  const [hov, setHov] = useState<HoverInfo | null>(null)

  const hasBenchmark = points.some((p) => p.benchmark != null)
  const height = heightOverride ?? (compact ? 200 : 240)
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const years = useMemo(() => points.map((p) => p.year), [points])

  const allValues = useMemo(() => {
    const vs: number[] = []
    for (const p of points) {
      vs.push(p.strategy)
      if (p.benchmark != null) vs.push(p.benchmark)
    }
    return vs
  }, [points])

  const maxAbs = Math.max(...allValues.map(Math.abs), 0.01)

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: years,
        range: [0, innerW],
        padding: hasBenchmark ? 0.2 : 0.32,
      }),
    [years, innerW, hasBenchmark],
  )

  const innerXScale = useMemo(
    () =>
      scaleBand<string>({
        domain: hasBenchmark ? ['strategy', 'benchmark'] : ['strategy'],
        range: [0, xScale.bandwidth()],
        padding: 0.08,
      }),
    [hasBenchmark, xScale],
  )

  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [-maxAbs, maxAbs], range: [innerH, 0], nice: true }),
    [maxAbs, innerH],
  )

  const zeroY = yScale(0)
  const gridValues = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Annual returns bar chart, ${years.length} years`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {gridValues.map((v) => (
            <g key={v}>
              <Line
                from={{ x: 0, y: yScale(v) }}
                to={{ x: innerW, y: yScale(v) }}
                stroke={v === 0 ? theme.text3 : theme.border}
                strokeWidth={v === 0 ? 1 : 0.5}
                strokeDasharray={v === 0 ? undefined : '2,4'}
                opacity={v === 0 ? 0.6 : 1}
              />
              <text
                x={-8}
                y={yScale(v) + 4}
                textAnchor="end"
                fontSize={11}
                fontFamily={theme.mono}
                fill={theme.text3}
              >
                {`${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
              </text>
            </g>
          ))}

          {points.map((point) => {
            const groupX = xScale(point.year) ?? 0
            const stratVal = point.strategy
            const bmVal = point.benchmark

            const renderBar = (
              key: string,
              val: number | null,
              colorPositive: string,
              colorNegative: string,
            ) => {
              if (val == null) return null
              const bx = innerXScale(key) ?? 0
              const bw = innerXScale.bandwidth()
              const positive = val >= 0
              const y = positive ? yScale(val) : zeroY
              const h = Math.abs(yScale(val) - zeroY)
              return (
                <Bar
                  key={key}
                  x={groupX + bx}
                  y={y}
                  width={bw}
                  height={Math.max(h, 1)}
                  fill={positive ? colorPositive : colorNegative}
                  opacity={hov === null || hov.year === point.year ? 0.85 : 0.35}
                />
              )
            }

            return (
              <g
                key={point.year}
                onMouseEnter={() =>
                  setHov({
                    year: point.year,
                    strategy: stratVal,
                    benchmark: bmVal ?? undefined,
                  })
                }
                onMouseLeave={() => setHov(null)}
                style={{ cursor: 'pointer' }}
              >
                {renderBar('strategy', stratVal, theme.success, theme.danger)}
                {hasBenchmark &&
                  renderBar('benchmark', bmVal, `${theme.text3}cc`, `${theme.text3}88`)}
                <text
                  x={groupX + xScale.bandwidth() / 2}
                  y={innerH + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily={theme.sans}
                  fontWeight={500}
                  fill={hov?.year === point.year ? theme.text : theme.text2}
                >
                  {point.year}
                </text>
              </g>
            )
          })}
        </Group>
      </svg>

      {hov && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text)',
            letterSpacing: 'var(--tracking-mono)',
            boxShadow: 'var(--shadow-2)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{hov.year}</div>
          <div>
            {tooltipLabels.strategy}{' '}
            <span style={{ color: hov.strategy >= 0 ? theme.success : theme.danger }}>
              {hov.strategy >= 0 ? '+' : ''}
              {hov.strategy.toFixed(2)}%
            </span>
          </div>
          {hov.benchmark != null && (
            <div style={{ color: 'var(--text2)' }}>
              {tooltipLabels.benchmark}{' '}
              {hov.benchmark >= 0 ? '+' : ''}
              {hov.benchmark.toFixed(2)}%
            </div>
          )}
        </div>
      )}

      {hasBenchmark && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            padding: '4px 0 0 60px',
            fontSize: 'var(--fs-mono-sm)',
            fontFamily: 'var(--mono)',
            color: 'var(--text2)',
          }}
        >
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 10,
                background: theme.success,
                marginRight: 4,
                borderRadius: 2,
              }}
            />
            {labels.strategy}
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 10,
                background: `${theme.text3}cc`,
                marginRight: 4,
                borderRadius: 2,
              }}
            />
            {labels.benchmark}
          </span>
        </div>
      )}
    </div>
  )
}
