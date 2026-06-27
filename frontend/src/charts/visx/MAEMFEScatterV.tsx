import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Circle, Line, Bar } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'

import type { ChartTheme } from '../../design/useChartTheme'

/**
 * MAE/MFE 散布図用のシリアライズ済みポイント。
 * Container 側で `Trade` から整形して渡す。
 */
export interface MAEMFEPoint {
  /** ハイライト・トラッキング用 ID（文字列化済み） */
  id: string
  /** MAE % */
  mae: number
  /** MFE % */
  mfe: number
  /** リターン %（符号付き、円サイズと色分けに使用） */
  returnPct: number
}

export interface MAEMFEScatterVLabels {
  xAxis: string
  yAxis: string
  diagonal: string
}

export interface MAEMFEScatterVProps {
  points: MAEMFEPoint[]
  /** チャート全体の高さ（px） */
  height: number
  /** マージン（軸ラベル領域を含む） */
  margin: { top: number; right: number; bottom: number; left: number }
  /** チャートテーマ（色・フォント） */
  theme: ChartTheme
  /** 軸 / 対角線ラベル */
  labels: MAEMFEScatterVLabels
  /** ハイライト中の trade id（null = 全表示） */
  highlightedId?: string | null
  /** 円の hover イベント */
  onPointEnter?: (e: React.MouseEvent<SVGCircleElement>, point: MAEMFEPoint) => void
  onPointLeave?: () => void
  /** aria-label 用の追加情報 */
  ariaLabel?: string
}

/**
 * MAE/MFE 散布図 Presentational。visx primitives のみで描画する。
 * 計算済みの `points` を受け取り、軸・対角線・点を描画する。
 */
export function MAEMFEScatterV(props: MAEMFEScatterVProps): React.ReactElement {
  return (
    <figure style={{ margin: 0 }}>
      <ParentSize>
        {({ width }) => (width > 0 ? <Inner width={width} {...props} /> : null)}
      </ParentSize>
      {/* 勝ち/負けを色だけでなくテキスト凡例でも示す（issue #262 色のみ依存の是正） */}
      <figcaption
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 4,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
          color: 'var(--text3)',
        }}
      >
        <span>
          <span aria-hidden="true" style={{ color: props.theme.success }}>
            ●
          </span>{' '}
          Win
        </span>
        <span>
          <span aria-hidden="true" style={{ color: props.theme.danger }}>
            ●
          </span>{' '}
          Loss
        </span>
      </figcaption>
    </figure>
  )
}

interface InnerProps extends MAEMFEScatterVProps {
  width: number
}

function Inner({
  width,
  points,
  height,
  margin,
  theme,
  labels,
  highlightedId = null,
  onPointEnter,
  onPointLeave,
  ariaLabel,
}: InnerProps): React.ReactElement {
  const maxMAE = Math.max(...points.map(p => p.mae), 1) * 1.12
  const maxMFE = Math.max(...points.map(p => p.mfe), 1) * 1.12

  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const xScale = scaleLinear<number>({ domain: [0, maxMAE], range: [0, innerW], nice: true })
  const yScale = scaleLinear<number>({ domain: [0, maxMFE], range: [innerH, 0], nice: true })

  const diagEnd = Math.min(maxMAE, maxMFE)

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <Group left={margin.left} top={margin.top}>
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

        {/* MAE = MFE 対角線 */}
        <Line
          from={{ x: xScale(0), y: yScale(0) }}
          to={{ x: xScale(diagEnd), y: yScale(diagEnd) }}
          stroke={theme.text3}
          strokeWidth={1.25}
          strokeDasharray="5,4"
          opacity={0.5}
        />
        <text
          x={xScale(diagEnd * 0.65) + 6}
          y={yScale(diagEnd * 0.65) - 6}
          fontFamily={theme.mono}
          fontSize={11}
          fill={theme.text3}
        >
          {labels.diagonal}
        </text>

        {points.map((p) => {
          const win = p.returnPct > 0
          const r = Math.max(3.5, Math.min(12, Math.abs(p.returnPct) * 1.3))
          const isHighlighted = highlightedId === null || highlightedId === p.id
          return (
            <Circle
              key={p.id}
              cx={xScale(p.mae)}
              cy={yScale(p.mfe)}
              r={r}
              fill={win ? theme.success : theme.danger}
              fillOpacity={isHighlighted ? 0.6 : 0.18}
              stroke={win ? theme.success : theme.danger}
              strokeWidth={isHighlighted ? 1 : 0.5}
              strokeOpacity={isHighlighted ? 0.9 : 0.35}
              onMouseEnter={onPointEnter ? (e) => onPointEnter(e, p) : undefined}
              onMouseLeave={onPointLeave}
              style={{ cursor: 'default' }}
            />
          )
        })}

        <AxisLeft
          scale={yScale}
          numTicks={5}
          stroke={theme.border}
          tickStroke={theme.border}
          tickFormat={(v) => `${(v as number).toFixed(1)}%`}
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
          tickFormat={(v) => `${(v as number).toFixed(1)}%`}
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
          y={innerH + 36}
          textAnchor="middle"
          fontFamily={theme.mono}
          fontSize={12}
          fontWeight={500}
          fill={theme.text2}
          letterSpacing="0.04em"
        >
          {labels.xAxis}
        </text>
        <text
          transform={`translate(${-margin.left + 14},${innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontFamily={theme.mono}
          fontSize={12}
          fontWeight={500}
          fill={theme.text2}
          letterSpacing="0.04em"
        >
          {labels.yAxis}
        </text>

        <Bar
          x={0}
          y={0}
          width={innerW}
          height={innerH}
          fill="transparent"
          pointerEvents="none"
        />
      </Group>
    </svg>
  )
}
