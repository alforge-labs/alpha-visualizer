import { useCallback } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Circle } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { localPoint } from '@visx/event'

import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { OptimizeTrial } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'

interface OptimizeScatterProps {
  trials: OptimizeTrial[]
  xParam: string
  metricName: string
  lang: Lang
  compact: boolean
}

const MARGIN = { top: 16, right: 24, bottom: 56, left: 64 }

interface Tip {
  trial: OptimizeTrial
}

export function OptimizeScatter(props: OptimizeScatterProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <OptimizeScatterInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function OptimizeScatterInner({
  width,
  trials,
  xParam,
  metricName,
  lang,
  compact,
}: OptimizeScatterProps & { width: number }): React.ReactElement {
  const theme = useChartTheme()
  const L = makeL(lang)

  const height = compact ? 260 : 320
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const valid = trials.filter((t) => xParam in t.params)
  const xValues = valid.map((t) => t.params[xParam] ?? 0)
  const yValues = valid.map((t) => t.metric)

  const xMin = xValues.length > 0 ? Math.min(...xValues) : 0
  const xMax = xValues.length > 0 ? Math.max(...xValues) : 1
  const yMin = yValues.length > 0 ? Math.min(...yValues) : -1
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 1
  const xPad = (xMax - xMin) * 0.08 || 1
  const yPad = (yMax - yMin) * 0.12 || 0.5

  const xScale = scaleLinear<number>({
    domain: [xMin - xPad, xMax + xPad],
    range: [0, innerW],
    nice: true,
  })
  const yScale = scaleLinear<number>({
    domain: [yMin - yPad, yMax + yPad],
    range: [innerH, 0],
    nice: true,
  })

  const passCount = valid.filter((t) => t.pass).length

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<Tip>()

  const handleEnter = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, trial: OptimizeTrial) => {
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      showTooltip({ tooltipData: { trial }, tooltipLeft: lp.x, tooltipTop: lp.y })
    },
    [showTooltip],
  )

  const metricLabel = metricName.replace(/_/g, ' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          gap: 20,
          paddingLeft: MARGIN.left,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
          color: 'var(--text3)',
        }}
      >
        <span>
          {L('試行数', 'Trials')}: {valid.length}
        </span>
        <span style={{ color: theme.success }}>
          {L('合格', 'Pass')}: {passCount}
        </span>
        <span style={{ color: theme.danger }}>
          {L('不合格', 'Fail')}: {valid.length - passCount}
        </span>
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Optimize scatter: ${xParam} vs ${metricName}, ${valid.length} trials`}
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
          <GridColumns
            scale={xScale}
            height={innerH}
            stroke={theme.border}
            strokeDasharray="2,4"
            numTicks={5}
          />

          {/* y = 0 基準線 */}
          {yScale(0) >= 0 && yScale(0) <= innerH && (
            <line
              x1={0}
              x2={innerW}
              y1={yScale(0)}
              y2={yScale(0)}
              stroke={theme.text3}
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={0.6}
            />
          )}

          {valid.map((trial, i) => (
            <Circle
              key={i}
              cx={xScale(trial.params[xParam] ?? 0)}
              cy={yScale(trial.metric)}
              r={5}
              fill={trial.pass ? theme.success : theme.danger}
              fillOpacity={0.55}
              stroke={trial.pass ? theme.success : theme.danger}
              strokeWidth={1}
              strokeOpacity={0.85}
              onMouseEnter={(e) => handleEnter(e, trial)}
              onMouseLeave={hideTooltip}
              style={{ cursor: 'default' }}
            />
          ))}

          <AxisLeft
            scale={yScale}
            numTicks={5}
            stroke={theme.border}
            tickStroke={theme.border}
            tickFormat={(v) => (v as number).toFixed(2)}
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
            tickFormat={(v) => String(v as number)}
            tickLabelProps={() => ({
              fill: theme.text3,
              fontFamily: theme.mono,
              fontSize: 11,
              textAnchor: 'middle',
              dy: '0.5em',
            })}
            hideAxisLine
          />

          <text
            x={innerW / 2}
            y={innerH + 38}
            textAnchor="middle"
            fontFamily={theme.mono}
            fontSize={12}
            fontWeight={500}
            fill={theme.text2}
            letterSpacing="0.04em"
          >
            {xParam}
          </text>
          <text
            transform={`translate(${-MARGIN.left + 14},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontFamily={theme.mono}
            fontSize={12}
            fontWeight={500}
            fill={theme.text2}
            letterSpacing="0.04em"
          >
            {metricLabel}
          </text>
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
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontWeight: 700,
                color: tooltipData.trial.pass ? theme.success : theme.danger,
              }}
            >
              {metricLabel}: {tooltipData.trial.metric.toFixed(3)}
            </span>
            {Object.entries(tooltipData.trial.params).map(([k, v]) => (
              <span key={k} style={{ color: theme.text3 }}>
                {k}: {v}
              </span>
            ))}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}
