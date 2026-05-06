import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar, Line } from '@visx/shape'
import { scaleBand, scaleLinear } from '@visx/scale'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { useChartTheme } from '../../design/useChartTheme'

interface Props {
  annualReturns: Record<string, number>
  benchmarkReturns?: Record<string, number>
  lang: Lang
  compact?: boolean
}

interface HoverInfo {
  year: string
  strategy: number
  benchmark?: number
}

const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 }

export function AnnualReturnsBar(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <AnnualReturnsInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function AnnualReturnsInner({
  width,
  annualReturns,
  benchmarkReturns,
  lang,
  compact = false,
}: Props & { width: number }): React.ReactElement {
  const theme = useChartTheme()
  const L = makeL(lang)
  const [hov, setHov] = useState<HoverInfo | null>(null)

  const hasBenchmark = !!benchmarkReturns && Object.keys(benchmarkReturns).length > 0

  const years = useMemo(
    () => Object.keys(annualReturns).sort(),
    [annualReturns],
  )

  const height = compact ? 200 : 240
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const allValues = useMemo(() => {
    const vals = years.map((y) => annualReturns[y] ?? 0)
    if (hasBenchmark) {
      years.forEach((y) => {
        const v = benchmarkReturns![y]
        if (v != null) vals.push(v)
      })
    }
    return vals
  }, [years, annualReturns, benchmarkReturns, hasBenchmark])

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

          {years.map((year) => {
            const groupX = xScale(year) ?? 0
            const stratVal = annualReturns[year] ?? 0
            const bmVal = hasBenchmark ? (benchmarkReturns![year] ?? null) : null

            const renderBar = (key: string, val: number | null, colorPositive: string, colorNegative: string) => {
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
                  opacity={hov === null || hov.year === year ? 0.85 : 0.35}
                />
              )
            }

            return (
              <g
                key={year}
                onMouseEnter={() =>
                  setHov({ year, strategy: stratVal, benchmark: bmVal ?? undefined })
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
                  fill={hov?.year === year ? theme.text : theme.text2}
                >
                  {year}
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
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{hov.year}</div>
          <div>
            {L('戦略', 'Strategy')}{' '}
            <span style={{ color: hov.strategy >= 0 ? theme.success : theme.danger }}>
              {hov.strategy >= 0 ? '+' : ''}
              {hov.strategy.toFixed(2)}%
            </span>
          </div>
          {hov.benchmark != null && (
            <div style={{ color: 'var(--text2)' }}>
              {L('B&H', 'B&H')}{' '}
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
            {L('戦略', 'Strategy')}
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
            {L('B&H', 'Buy & Hold')}
          </span>
        </div>
      )}
    </div>
  )
}
