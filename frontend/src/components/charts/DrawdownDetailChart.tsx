import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { useDashboard } from '../../contexts/DashboardContext'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { useChartTheme } from '../../design/useChartTheme'

interface DrawdownPeriod {
  startIdx: number
  peakIdx: number
  endIdx: number
  depth: number
  durationDays: number
  recoveryDays: number | null
  startDate: string
  endDate: string
}

function detectTopDrawdowns(dd: number[], dates: string[], top = 5): DrawdownPeriod[] {
  const periods: DrawdownPeriod[] = []
  let inDD = false
  let start = 0
  let minIdx = 0
  let minVal = 0

  for (let i = 0; i < dd.length; i++) {
    const v = dd[i] ?? 0
    if (!inDD && v < -0.01) {
      inDD = true
      start = i
      minIdx = i
      minVal = v
    } else if (inDD) {
      if (v < minVal) {
        minIdx = i
        minVal = v
      }
      if (v >= -0.01 || i === dd.length - 1) {
        const recovery = v >= -0.01 ? i - minIdx : null
        periods.push({
          startIdx: start,
          peakIdx: minIdx,
          endIdx: i,
          depth: minVal,
          durationDays: i - start,
          recoveryDays: recovery,
          startDate: dates[start] ?? '',
          endDate: dates[i] ?? '',
        })
        inDD = false
      }
    }
  }
  return periods.sort((a, b) => a.depth - b.depth).slice(0, top)
}

interface Props {
  drawdown: number[]
  dates: string[]
  lang: Lang
}

const ROW_HEIGHT = 36
const BAR_HEIGHT = 12
const LEFT_LABEL_W = 84
const RIGHT_INFO_W = 152

export function DrawdownDetailChart(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <DrawdownDetailInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function DrawdownDetailInner({
  width,
  drawdown,
  dates,
  lang,
}: Props & { width: number }): React.ReactElement {
  const { setHighlightedDateRange } = useDashboard()
  const theme = useChartTheme()
  const L = makeL(lang)

  const periods = useMemo(() => detectTopDrawdowns(drawdown, dates), [drawdown, dates])
  const maxDepth = useMemo(
    () => Math.abs(Math.min(...periods.map(p => p.depth), -0.01)),
    [periods],
  )

  const barAreaW = Math.max(120, width - LEFT_LABEL_W - RIGHT_INFO_W - 24)
  const totalH = periods.length * ROW_HEIGHT + 28

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, maxDepth], range: [0, barAreaW] }),
    [maxDepth, barAreaW],
  )

  return (
    <div>
      <p
        style={{
          margin: '0 0 12px 0',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-mono)',
        }}
      >
        {L('クリックで Overview に期間ハイライト', 'Click to highlight the period in Overview')}
      </p>
      <svg
        width={width}
        height={totalH}
        role="img"
        aria-label={`Top drawdowns, ${periods.length} periods`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Group top={4}>
          {periods.map((p, i) => {
            const y = i * ROW_HEIGHT
            const barW = xScale(Math.abs(p.depth))
            const labelDate = p.startDate.slice(0, 10)
            return (
              <g
                key={i}
                onClick={() =>
                  setHighlightedDateRange({ start: p.startDate, end: p.endDate })
                }
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={0}
                  y={y}
                  width={width - 4}
                  height={ROW_HEIGHT - 8}
                  fill="transparent"
                />
                {/* 左: depth */}
                <text
                  x={LEFT_LABEL_W - 8}
                  y={y + ROW_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontFamily={theme.mono}
                  fontSize={13}
                  fontWeight={600}
                  fill={theme.danger}
                >
                  {p.depth.toFixed(2)}%
                </text>
                {/* track */}
                <Bar
                  x={LEFT_LABEL_W}
                  y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                  width={barAreaW}
                  height={BAR_HEIGHT}
                  fill={theme.border}
                  opacity={0.6}
                  rx={2}
                />
                {/* depth bar */}
                <Bar
                  x={LEFT_LABEL_W}
                  y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                  width={Math.max(barW, 1)}
                  height={BAR_HEIGHT}
                  fill={theme.danger}
                  rx={2}
                />
                {/* 右: 期間情報 */}
                <text
                  x={LEFT_LABEL_W + barAreaW + 12}
                  y={y + ROW_HEIGHT / 2 - 5}
                  fontFamily={theme.mono}
                  fontSize={11}
                  fill={theme.text3}
                  letterSpacing="0.04em"
                >
                  {labelDate}
                </text>
                <text
                  x={LEFT_LABEL_W + barAreaW + 12}
                  y={y + ROW_HEIGHT / 2 + 9}
                  fontFamily={theme.mono}
                  fontSize={11}
                  fill={theme.text3}
                  letterSpacing="0.04em"
                >
                  {p.durationDays}d ·{' '}
                  {p.recoveryDays != null
                    ? L(`${p.recoveryDays}d回復`, `${p.recoveryDays}d recovery`)
                    : L('未回復', 'No recovery')}
                </text>
              </g>
            )
          })}
          {periods.length === 0 && (
            <text
              x={LEFT_LABEL_W}
              y={20}
              fontFamily={theme.mono}
              fontSize={12}
              fill={theme.text3}
            >
              {L('検出された大きなドローダウンはありません', 'No major drawdowns detected')}
            </text>
          )}
        </Group>
      </svg>
    </div>
  )
}
