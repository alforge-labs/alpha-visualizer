import { useCallback, useContext, useMemo } from 'react'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { localPoint } from '@visx/event'

import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { DashboardContext } from '../../contexts/DashboardContext'
import { useChartTheme } from '../../design/useChartTheme'
import { MAEMFEScatterV, type MAEMFEPoint } from '../../charts/visx/MAEMFEScatterV'

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

/**
 * MAE/MFE 散布図 Container。
 *
 * Trade 配列を受け取り、{@link MAEMFEScatterV} 用の整形済みポイントへ変換する。
 * tooltip / DashboardContext によるハイライト連動はここで保持し、
 * Presentational には callback と props のみ渡す。
 */
export function MAEMFEScatter({ trades, lang, compact }: MAEMFEScatterProps): React.ReactElement {
  const theme = useChartTheme()
  const ctx = useContext(DashboardContext)
  const highlightedTradeId = ctx?.highlightedTradeId ?? null
  const setHighlightedTradeId = useMemo(
    () => ctx?.setHighlightedTradeId ?? ((): void => undefined),
    [ctx],
  )
  const L = makeL(lang)

  const valid = useMemo(
    () => trades.filter(t => t.mae_pct != null && t.mfe_pct != null),
    [trades],
  )

  // visx に渡す整形済みポイントと Trade の対応表を同時に作る
  const { points, tradeById } = useMemo(() => {
    const pts: MAEMFEPoint[] = valid.map(t => ({
      id: String(t.id),
      mae: t.mae_pct,
      mfe: t.mfe_pct,
      returnPct: t.return_pct,
    }))
    const map = new Map<string, Trade>()
    valid.forEach(t => map.set(String(t.id), t))
    return { points: pts, tradeById: map }
  }, [valid])

  const wins = valid.filter(t => t.return_pct > 0)
  const losses = valid.filter(t => t.return_pct <= 0)

  const avg = (xs: number[]): string =>
    xs.length === 0 ? '—' : (xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(2)
  const avgMAEWin = avg(wins.map(t => t.mae_pct))
  const avgMFEWin = avg(wins.map(t => t.mfe_pct))
  const avgMAELoss = avg(losses.map(t => t.mae_pct))

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<Tip>()

  const handleEnter = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      point: MAEMFEPoint,
    ) => {
      const trade = tradeById.get(point.id)
      if (!trade) return
      const lp = localPoint(e) ?? { x: 0, y: 0 }
      showTooltip({
        tooltipData: { trade, cx: lp.x, cy: lp.y },
        tooltipLeft: lp.x,
        tooltipTop: lp.y,
      })
      setHighlightedTradeId(point.id)
    },
    [showTooltip, setHighlightedTradeId, tradeById],
  )

  const handleLeave = useCallback(() => {
    hideTooltip()
    setHighlightedTradeId(null)
  }, [hideTooltip, setHighlightedTradeId])

  const height = compact ? 280 : 340

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

      <MAEMFEScatterV
        points={points}
        height={height}
        margin={MARGIN}
        theme={theme}
        labels={{
          xAxis: `MAE % — ${L('最大不利変動', 'Max adverse excursion')}`,
          yAxis: `MFE % — ${L('最大有利変動', 'Max favorable excursion')}`,
          diagonal: 'MAE = MFE',
        }}
        highlightedId={highlightedTradeId}
        onPointEnter={handleEnter}
        onPointLeave={handleLeave}
        ariaLabel={`MAE versus MFE scatter, ${valid.length} trades (${wins.length} winning, ${losses.length} losing)`}
      />

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
