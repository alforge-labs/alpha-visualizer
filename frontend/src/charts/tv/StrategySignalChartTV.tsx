import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts'

import type { OhlcBar, RegimeSeries, Trade } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'
import { compareTime, toCandlestickData } from './data'
import {
  candlestickOptions,
  chartThemeToOptions,
  entryPriceLineOptions,
  slPriceLineOptions,
  tpPriceLineOptions,
  tradeMarkerColors,
} from './theme'
import { pickFocusTrade, regimeChangeMarkers, tradeToPriceLines, tradesToMarkers } from './trades'

export interface StrategySignalChartTVProps {
  bars: OhlcBar[]
  trades: Trade[]
  /**
   * `BacktestDetail.regime_series` をそのまま渡す。`showRegime=true` のとき
   * 状態遷移点に circle marker を打つ（trade markers と併存）。lightweight-charts
   * では時間軸の背景塗り分けが標準で提供されないため marker ベースの最小実装で
   * 開始し、将来 ISeriesPrimitive ベースの背景 overlay に拡張する余地を残す。
   */
  regimeSeries?: RegimeSeries | null
  /** regime markers を表示するか（既定 false） */
  showRegime?: boolean
  compact?: boolean
  ref?: React.Ref<StrategySignalChartTVHandle>
}

export interface StrategySignalChartTVHandle {
  /** lightweight-charts の Canvas を PNG として保存する。 */
  exportPng: (filename: string) => void
}

export function StrategySignalChartTV(props: StrategySignalChartTVProps) {
  const { bars, trades, regimeSeries, showRegime = false, compact = false, ref } = props

  const theme = useChartTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  const candlestickData = useMemo(() => toCandlestickData(bars), [bars])
  const colors = useMemo(() => tradeMarkerColors(theme), [theme])
  const tradeMarkers = useMemo(() => tradesToMarkers(trades, colors), [trades, colors])
  const regimeMarkers = useMemo(
    () => (showRegime ? regimeChangeMarkers(regimeSeries, theme.text3) : []),
    [showRegime, regimeSeries, theme.text3],
  )
  const markers = useMemo(() => {
    if (regimeMarkers.length === 0) return tradeMarkers
    return [...tradeMarkers, ...regimeMarkers].sort((a, b) => compareTime(a.time, b.time))
  }, [tradeMarkers, regimeMarkers])
  const focusTrade = useMemo(() => pickFocusTrade(trades), [trades])
  const priceLineSpecs = useMemo(
    () => tradeToPriceLines(focusTrade, colors),
    [focusTrade, colors],
  )

  // create-once: マウント時に一度だけ chart / series / markers plugin を構築。
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChart(container, {
      autoSize: true,
      ...chartThemeToOptions(theme),
    })
    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, candlestickOptions(theme), 0)
    candleSeriesRef.current = candleSeries

    markersPluginRef.current = createSeriesMarkers(candleSeries, [])

    return () => {
      // priceLine は series.removePriceLine で破棄する必要があるが、
      // chart.remove() が series ごと破棄するため明示 cleanup は不要。
      priceLinesRef.current = []
      markersPluginRef.current = null
      candleSeriesRef.current = null
      chart.remove()
      chartRef.current = null
    }
    // create-once: theme 変更は別 effect で applyOptions する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // theme 変更で chart / series の見た目だけ更新する。
  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    if (!chart || !candleSeries) return
    chart.applyOptions(chartThemeToOptions(theme))
    candleSeries.applyOptions(candlestickOptions(theme))
  }, [theme])

  // OHLC data と markers の反映。viewport を bars の全範囲に合わせる。
  useEffect(() => {
    candleSeriesRef.current?.setData(candlestickData)
    markersPluginRef.current?.setMarkers(markers)
    const first = candlestickData[0]?.time
    const last = candlestickData[candlestickData.length - 1]?.time
    if (first != null && last != null) {
      chartRef.current?.timeScale().setVisibleRange({ from: first, to: last })
    }
  }, [candlestickData, markers])

  // priceLine の更新: 都度 remove → create で累積を防ぐ。
  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    if (!candleSeries) return
    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line)
    }
    priceLinesRef.current = []
    for (const spec of priceLineSpecs) {
      let options
      if (spec.kind === 'sl') options = slPriceLineOptions(theme, spec.price)
      else if (spec.kind === 'tp') options = tpPriceLineOptions(theme, spec.price)
      else options = entryPriceLineOptions(theme, spec.price)
      const line = candleSeries.createPriceLine(options)
      priceLinesRef.current.push(line)
    }
  }, [priceLineSpecs, theme])

  useImperativeHandle(
    ref,
    () => ({
      exportPng: (filename: string) => {
        const chart = chartRef.current
        if (!chart) return
        const canvas = chart.takeScreenshot()
        canvas.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          a.click()
          URL.revokeObjectURL(url)
        }, 'image/png')
      },
    }),
    [],
  )

  const height = compact ? 320 : 420

  return (
    <div
      ref={containerRef}
      data-testid="strategy-signal-chart-tv"
      role="img"
      aria-label={`Strategy signal chart, ${candlestickData.length} bars, ${trades.length} trades${
        regimeMarkers.length > 0 ? `, ${regimeMarkers.length} regime changes` : ''
      }`}
      style={{ width: '100%', height }}
    />
  )
}
