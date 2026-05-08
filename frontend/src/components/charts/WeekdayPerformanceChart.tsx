import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar, Line } from '@visx/shape'
import { scaleBand, scaleLinear } from '@visx/scale'
import { useDashboard, RANGE_N } from '../../contexts/DashboardContext'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { useChartTheme } from '../../design/useChartTheme'
import { computeWeekdayStats } from '../../lib/weekday'

interface Props {
  dailyReturns: number[]
  dates: string[]
  lang: Lang
  compact?: boolean
}

// 集計ロジックは lib/weekday.ts の純関数 computeWeekdayStats に集約（ADR-0002）。

const WEEKDAY_LABELS_JA = ['月', '火', '水', '木', '金']
const WEEKDAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 }

export function WeekdayPerformanceChart(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <WeekdayInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function WeekdayInner({
  width,
  dailyReturns,
  dates,
  lang,
  compact = false,
}: Props & { width: number }): React.ReactElement {
  const { selectedRange } = useDashboard()
  const theme = useChartTheme()
  const L = makeL(lang)
  const [hovIdx, setHovIdx] = useState<number | null>(null)

  const labels = lang === 'ja' ? WEEKDAY_LABELS_JA : WEEKDAY_LABELS_EN

  const { slicedReturns, slicedDates } = useMemo(() => {
    const n = dailyReturns.length
    const bars = Math.min(RANGE_N[selectedRange], n)
    const s = Math.max(0, n - bars)
    return {
      slicedReturns: dailyReturns.slice(s),
      slicedDates: dates.slice(s),
    }
  }, [dailyReturns, dates, selectedRange])

  const stats = useMemo(
    () => computeWeekdayStats(slicedReturns, slicedDates, labels),
    [slicedReturns, slicedDates, labels],
  )

  const height = compact ? 200 : 240
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const maxAbs = Math.max(...stats.map(s => Math.abs(s.avg)), 0.01)

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: stats.map(s => s.day),
        range: [0, innerW],
        padding: 0.32,
      }),
    [stats, innerW],
  )

  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [-maxAbs, maxAbs], range: [innerH, 0], nice: true }),
    [maxAbs, innerH],
  )

  const zeroY = yScale(0)

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Weekday average return, ${stats.length} weekdays`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {[-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs].map((v, i) => (
            <g key={i}>
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
                {`${v.toFixed(2)}%`}
              </text>
            </g>
          ))}

          {stats.map((s, i) => {
            const x = xScale(s.day) ?? 0
            const w = xScale.bandwidth()
            const positive = s.avg >= 0
            const y = positive ? yScale(s.avg) : zeroY
            const h = Math.abs(yScale(s.avg) - zeroY)
            return (
              <g
                key={s.day}
                onMouseEnter={() => setHovIdx(i)}
                onMouseLeave={() => setHovIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                <Bar
                  x={x}
                  y={y}
                  width={w}
                  height={Math.max(h, 1)}
                  fill={positive ? theme.success : theme.danger}
                  opacity={hovIdx === null || hovIdx === i ? 0.85 : 0.4}
                />
                <text
                  x={x + w / 2}
                  y={innerH + 18}
                  textAnchor="middle"
                  fontSize={12}
                  fontFamily={theme.sans}
                  fontWeight={500}
                  fill={hovIdx === i ? theme.text : theme.text2}
                >
                  {s.day}
                </text>
              </g>
            )
          })}
        </Group>
      </svg>
      {hovIdx !== null && stats[hovIdx] && (
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
          <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{stats[hovIdx].day}</div>
          <div>Avg {stats[hovIdx].avg.toFixed(3)}%</div>
          <div>Win {stats[hovIdx].winRate.toFixed(1)}%</div>
          <div>
            {L('件数', 'Count')} {stats[hovIdx].count}
          </div>
        </div>
      )}
    </div>
  )
}
