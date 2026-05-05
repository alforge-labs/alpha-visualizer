import { useCallback, useContext, useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Circle, Line, Bar } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { localPoint } from '@visx/event'

import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { DashboardContext } from '../../contexts/DashboardContext'
import { useChartTheme } from '../../design/useChartTheme'

interface MAEMFEScatterProps {
  trades: Trade[]
  lang: Lang
  compact: boolean
}

const MARGIN = { top: 16, right: 24, bottom: 56, left: 64 }

interface Tip {
  trade: Trade
  cx: number
  cy: number
}

export function MAEMFEScatter(props: MAEMFEScatterProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <MAEMFEInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function MAEMFEInner({
  width,
  trades,
  lang,
  compact,
}: MAEMFEScatterProps & { width: number }): React.ReactElement {
  const theme = useChartTheme()
  const ctx = useContext(DashboardContext)
  const highlightedTradeId = ctx?.highlightedTradeId ?? null
  const setHighlightedTradeId = useMemo(
    () => ctx?.setHighlightedTradeId ?? ((): void => undefined),
    [ctx],
  )
  const L = makeL(lang)

  const valid = trades.filter(t => t.mae_pct != null && t.mfe_pct != null)
  const maxMAE = Math.max(...valid.map(t => t.mae_pct), 1) * 1.12
  const maxMFE = Math.max(...valid.map(t => t.mfe_pct), 1) * 1.12

  const height = compact ? 280 : 340
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const xScale = scaleLinear<number>({ domain: [0, maxMAE], range: [0, innerW], nice: true })
  const yScale = scaleLinear<number>({ domain: [0, maxMFE], range: [innerH, 0], nice: true })

  const wins = valid.filter(t => t.return_pct > 0)
  const losses = valid.filter(t => t.return_pct <= 0)

  const avg = (xs: number[]): string =>
    xs.length === 0 ? '—' : (xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(2)
  const avgMAEWin = avg(wins.map(t => t.mae_pct))
  const avgMFEWin = avg(wins.map(t => t.mfe_pct))
  const avgMAELoss = avg(losses.map(t => t.mae_pct))

  const diagEnd = Math.min(maxMAE, maxMFE)

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<Tip>()

  const handleEnter = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      t: Trade,
    ) => {
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      showTooltip({
        tooltipData: { trade: t, cx: lp.x, cy: lp.y },
        tooltipLeft: lp.x,
        tooltipTop: lp.y,
      })
      setHighlightedTradeId(String(t.id))
    },
    [showTooltip, setHighlightedTradeId],
  )

  const handleLeave = useCallback(() => {
    hideTooltip()
    setHighlightedTradeId(null)
  }, [hideTooltip, setHighlightedTradeId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          paddingLeft: MARGIN.left,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: theme.success,
              opacity: 0.75,
            }}
          />
          <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text)' }}>
            {L('利益', 'Winning')}
          </span>
          <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
            {wins.length} · MAE {avgMAEWin}% / MFE {avgMFEWin}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: theme.danger,
              opacity: 0.75,
            }}
          />
          <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text)' }}>
            {L('損失', 'Losing')}
          </span>
          <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
            {losses.length} · MAE {avgMAELoss}%
          </span>
        </div>
        <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>
          {L('円サイズ = |リターン|', 'dot size = |return|')}
        </span>
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`MAE versus MFE scatter, ${valid.length} trades (${wins.length} winning, ${losses.length} losing)`}
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
            MAE = MFE
          </text>

          {valid.map((t) => {
            const win = t.return_pct > 0
            const r = Math.max(3.5, Math.min(12, Math.abs(t.return_pct) * 1.3))
            const isHighlighted =
              highlightedTradeId === null || highlightedTradeId === String(t.id)
            return (
              <Circle
                key={t.id}
                cx={xScale(t.mae_pct)}
                cy={yScale(t.mfe_pct)}
                r={r}
                fill={win ? theme.success : theme.danger}
                fillOpacity={isHighlighted ? 0.6 : 0.18}
                stroke={win ? theme.success : theme.danger}
                strokeWidth={isHighlighted ? 1 : 0.5}
                strokeOpacity={isHighlighted ? 0.9 : 0.35}
                onMouseEnter={(e) => handleEnter(e, t)}
                onMouseLeave={handleLeave}
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
            MAE % — {L('最大不利変動', 'Max adverse excursion')}
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
            MFE % — {L('最大有利変動', 'Max favorable excursion')}
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
            <span style={{ color: theme.text3, fontSize: 11 }}>
              #{tooltipData.trade.id} · {tooltipData.trade.direction} · {tooltipData.trade.holding_days}d
            </span>
            <span
              style={{
                fontWeight: 700,
                color: tooltipData.trade.return_pct > 0 ? theme.success : theme.danger,
              }}
            >
              {tooltipData.trade.return_pct > 0 ? '+' : ''}
              {tooltipData.trade.return_pct.toFixed(2)}%
            </span>
            <span style={{ color: theme.text3 }}>MAE {tooltipData.trade.mae_pct.toFixed(2)}%</span>
            <span style={{ color: theme.text3 }}>MFE {tooltipData.trade.mfe_pct.toFixed(2)}%</span>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}
