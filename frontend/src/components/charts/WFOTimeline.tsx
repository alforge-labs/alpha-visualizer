import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar } from '@visx/shape'
import { scaleTime, scaleBand, scaleLinear } from '@visx/scale'
import { AxisBottom } from '@visx/axis'

import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { WFOWindow } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'
import { parseMonth, parseMonthEnd, summarizeWfoWindows } from '../../lib/wfo'

interface WFOTimelineProps {
  windows: WFOWindow[]
  lang: Lang
}

const TIMELINE_MARGIN = { top: 12, right: 24, bottom: 36, left: 48 }
const ROW_HEIGHT = 36
const ROW_GAP = 6

export function WFOTimeline({ windows, lang }: WFOTimelineProps): React.ReactElement {
  const L = makeL(lang)
  const theme = useChartTheme()

  // 集計値は lib/wfo.ts の純関数 summarizeWfoWindows に集約（ADR-0002）。
  const summary = summarizeWfoWindows(windows)
  const { passCount: passN, total, avgRatio, avgIS, avgOOS } = summary

  const passRateColor = passN / total >= 0.7 ? theme.success : theme.warn
  const ratioNum = parseFloat(avgRatio)
  const ratioColor = ratioNum >= 0.7 ? theme.success : ratioNum < 0 ? theme.danger : theme.warn
  const oosColor = parseFloat(avgOOS) > 0 ? theme.success : theme.danger

  const summaryItems: ReadonlyArray<readonly [string, string, string]> = [
    [L('パス率', 'Pass rate'), `${passN}/${total}`, passRateColor],
    [L('平均 OOS/IS 比', 'Avg OOS/IS'), avgRatio, ratioColor],
    [L('IS 平均 Sharpe', 'Avg IS Sharpe'), avgIS, theme.text],
    [L('OOS 平均 Sharpe', 'Avg OOS Sharpe'), avgOOS, oosColor],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {summaryItems.map(([lbl, val, col], i) => (
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
                fontSize: '1.625rem',
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
      </div>

      <ParentSize>
        {({ width }) => (width > 0 ? <TimelineSection width={width} windows={windows} lang={lang} /> : null)}
      </ParentSize>

      <SharpeBars windows={windows} lang={lang} />
    </div>
  )
}

interface TimelineSectionProps {
  width: number
  windows: WFOWindow[]
  lang: Lang
}

// parseMonth / parseMonthEnd は lib/wfo.ts に移送。

function TimelineSection({ width, windows, lang }: TimelineSectionProps): React.ReactElement {
  const theme = useChartTheme()
  const L = makeL(lang)

  const xDomain = useMemo<[Date, Date]>(() => {
    const dates: Date[] = []
    for (const w of windows) {
      dates.push(parseMonth(w.is_start), parseMonthEnd(w.oos_end))
    }
    if (dates.length === 0) {
      const now = new Date()
      return [now, now]
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())))
    const max = new Date(Math.max(...dates.map(d => d.getTime())))
    return [min, max]
  }, [windows])

  const innerW = Math.max(0, width - TIMELINE_MARGIN.left - TIMELINE_MARGIN.right)
  const totalH =
    windows.length * (ROW_HEIGHT + ROW_GAP) + TIMELINE_MARGIN.top + TIMELINE_MARGIN.bottom + 8

  const xScale = useMemo(
    () => scaleTime({ domain: xDomain, range: [0, innerW] }),
    [xDomain, innerW],
  )

  const yScale = useMemo(
    () =>
      scaleBand<number>({
        domain: windows.map(w => w.id),
        range: [0, windows.length * (ROW_HEIGHT + ROW_GAP)],
        padding: 0.1,
      }),
    [windows],
  )

  const successFaint = `color-mix(in srgb, ${theme.success} 14%, transparent)`
  const successStroke = `color-mix(in srgb, ${theme.success} 35%, transparent)`
  const accentSoft = `color-mix(in srgb, ${theme.accent} 18%, transparent)`
  const accentStroke = `color-mix(in srgb, ${theme.accent} 40%, transparent)`
  const dangerFaint = `color-mix(in srgb, ${theme.danger} 18%, transparent)`
  const dangerStroke = `color-mix(in srgb, ${theme.danger} 40%, transparent)`

  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 500,
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {L('タイムライン', 'Timeline')}
      </div>
      <svg
        width={width}
        height={totalH}
        role="img"
        aria-label={`Walk-forward timeline, ${windows.length} windows`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Group left={TIMELINE_MARGIN.left} top={TIMELINE_MARGIN.top}>
          {windows.map(w => {
            const yBase = yScale(w.id) ?? 0
            const isStart = parseMonth(w.is_start)
            const isEnd = parseMonthEnd(w.is_end)
            const oosStart = parseMonth(w.oos_start)
            const oosEnd = parseMonthEnd(w.oos_end)
            const isX = xScale(isStart)
            const isW = Math.max(2, xScale(isEnd) - isX)
            const oosX = xScale(oosStart)
            const oosW = Math.max(2, xScale(oosEnd) - oosX)
            return (
              <g key={w.id}>
                <text
                  x={-12}
                  y={yBase + ROW_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontFamily={theme.mono}
                  fontSize={12}
                  fontWeight={600}
                  fill={theme.text2}
                >
                  {w.label}
                </text>
                <Bar
                  x={isX}
                  y={yBase}
                  width={isW}
                  height={ROW_HEIGHT}
                  fill={accentSoft}
                  stroke={accentStroke}
                  strokeWidth={1}
                  rx={5}
                />
                <text
                  x={isX + 6}
                  y={yBase + ROW_HEIGHT / 2 + 4}
                  fontFamily={theme.mono}
                  fontSize={11}
                  fill={theme.accent}
                  fontWeight={600}
                >
                  IS {w.is_sharpe.toFixed(2)}
                </text>
                <Bar
                  x={oosX}
                  y={yBase}
                  width={oosW}
                  height={ROW_HEIGHT}
                  fill={w.pass ? successFaint : dangerFaint}
                  stroke={w.pass ? successStroke : dangerStroke}
                  strokeWidth={1}
                  rx={5}
                />
                <text
                  x={oosX + 6}
                  y={yBase + ROW_HEIGHT / 2 + 4}
                  fontFamily={theme.mono}
                  fontSize={11}
                  fontWeight={700}
                  fill={w.pass ? theme.success : theme.danger}
                >
                  OOS {w.oos_sharpe.toFixed(2)}
                </text>
              </g>
            )
          })}
          <AxisBottom
            top={windows.length * (ROW_HEIGHT + ROW_GAP) + 4}
            scale={xScale}
            numTicks={Math.min(8, Math.max(2, Math.round(width / 120)))}
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
    </div>
  )
}

interface SharpeBarsProps {
  windows: WFOWindow[]
  lang: Lang
}

function SharpeBars({ windows, lang }: SharpeBarsProps): React.ReactElement {
  const theme = useChartTheme()
  const L = makeL(lang)

  const maxSharpe = useMemo(
    () => Math.max(...windows.map(w => Math.max(w.is_sharpe, Math.abs(w.oos_sharpe))), 1) * 1.1,
    [windows],
  )

  const barScale = useMemo(
    () => scaleLinear<number>({ domain: [0, maxSharpe], range: [0, 100] }),
    [maxSharpe],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        {L('IS と OOS の Sharpe', 'IS vs OOS Sharpe')}
      </span>
      {windows.map(w => {
        const isW = barScale(Math.max(w.is_sharpe, 0))
        const oosW = barScale(Math.min(Math.abs(w.oos_sharpe), maxSharpe))
        return (
          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                fontWeight: 700,
                color: 'var(--text2)',
                width: 28,
                flexShrink: 0,
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {w.label}
            </span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <BarRow
                width={isW}
                color={`color-mix(in srgb, ${theme.accent} 35%, transparent)`}
                label={`IS ${w.is_sharpe.toFixed(2)}`}
                color2={theme.text3}
              />
              <BarRow
                width={oosW}
                color={
                  w.pass
                    ? `color-mix(in srgb, ${theme.success} 65%, transparent)`
                    : `color-mix(in srgb, ${theme.danger} 55%, transparent)`
                }
                label={`OOS ${w.oos_sharpe.toFixed(2)}${w.pass ? ' ✓' : ' ✗'}`}
                color2={w.pass ? theme.success : theme.danger}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: w.oos_is_ratio > 0 ? 'var(--text3)' : 'var(--danger)',
                width: 80,
                textAlign: 'right',
                flexShrink: 0,
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              ratio {w.oos_is_ratio.toFixed(3)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface BarRowProps {
  width: number
  color: string
  label: string
  color2: string
}

function BarRow({ width, color, label, color2 }: BarRowProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: `${width}%`,
          height: 6,
          background: color,
          borderRadius: 3,
        }}
      />
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: color2,
          letterSpacing: 'var(--tracking-mono)',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  )
}
