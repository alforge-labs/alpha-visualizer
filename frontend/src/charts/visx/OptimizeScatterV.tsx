import { useCallback } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Circle } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { localPoint } from '@visx/event'

import { useChartTheme } from '../../design/useChartTheme'

/** Container から渡される 1 試行ぶんの整形済みデータ。 */
export interface OptimizeScatterPoint {
  x: number
  y: number
  pass: boolean
  /** ツールチップに表示するパラメータ（key: value のマップ）。 */
  params: Record<string, number>
}

export interface OptimizeScatterVProps {
  points: OptimizeScatterPoint[]
  /** X 軸ラベル（パラメータ名）。 */
  xLabel: string
  /** Y 軸ラベル（メトリクス名、表示用に空白置換済み）。 */
  yLabel: string
  /** ヘッダ表示用の集計テキスト（試行数・合格・不合格 等）。 */
  summary: ReadonlyArray<readonly [string, string | number, string]>
  height?: number
}

const MARGIN = { top: 16, right: 24, bottom: 56, left: 64 }

interface Tip {
  point: OptimizeScatterPoint
}

/**
 * 最適化トライアル散布図 (Presentational)。
 *
 * Container 側で param/metric の抽出と pass/fail 判定を行ったあと、
 * 整形済みポイント列を受けて visx で描画する。
 */
export function OptimizeScatterV(props: OptimizeScatterVProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <Inner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function Inner({
  width,
  points,
  xLabel,
  yLabel,
  summary,
  height = 320,
}: OptimizeScatterVProps & { width: number }): React.ReactElement {
  const theme = useChartTheme()

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const xMin = points.length > 0 ? Math.min(...points.map(p => p.x)) : 0
  const xMax = points.length > 0 ? Math.max(...points.map(p => p.x)) : 1
  const yMin = points.length > 0 ? Math.min(...points.map(p => p.y)) : -1
  const yMax = points.length > 0 ? Math.max(...points.map(p => p.y)) : 1
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

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<Tip>()

  const handleEnter = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, point: OptimizeScatterPoint) => {
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      showTooltip({ tooltipData: { point }, tooltipLeft: lp.x, tooltipTop: lp.y })
    },
    [showTooltip],
  )

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
        {summary.map(([label, value, color], i) => (
          <span key={i} style={{ color }}>
            {label}: {value}
          </span>
        ))}
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Optimize scatter: ${xLabel} vs ${yLabel}, ${points.length} trials`}
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

          {points.map((point, i) => (
            <Circle
              key={i}
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={5}
              fill={point.pass ? theme.success : theme.danger}
              fillOpacity={0.55}
              stroke={point.pass ? theme.success : theme.danger}
              strokeWidth={1}
              strokeOpacity={0.85}
              onMouseEnter={(e) => handleEnter(e, point)}
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
            {xLabel}
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
            {yLabel}
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
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontWeight: 700,
                color: tooltipData.point.pass ? theme.success : theme.danger,
              }}
            >
              {yLabel}: {tooltipData.point.y.toFixed(3)}
            </span>
            {Object.entries(tooltipData.point.params).map(([k, v]) => (
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
