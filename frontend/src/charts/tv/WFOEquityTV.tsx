import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AreaSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'

import { useChartTheme } from '../../design/useChartTheme'
import type { WFOWindow } from '../../api/types'
import { chartThemeToOptions, equityAreaOptions } from './theme'
import { dateStringToTime, toLineData } from './data'

export interface WFOEquityTVProps {
  /** OOS 合成エクイティ（全ウィンドウの実績を結合した値） */
  composite_equity: number[]
  /** composite_equity と同じ長さの日付列 */
  composite_dates: string[]
  /** ウィンドウ境界 marker 用 (`oos_start` を境界位置として利用) */
  windows: WFOWindow[]
  compact?: boolean
}

function makeWindowMarkers(
  windows: WFOWindow[],
  passColor: string,
  failColor: string,
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = []
  for (const w of windows) {
    const time = dateStringToTime(w.oos_start)
    if (time == null) continue
    // pass フラグは Python 予約語のため backend では extra フィールドだが、
    // ジェネレータが付ける型に強制せず読み取れる形で抽出する。
    const passLike = (w as unknown as { pass?: boolean }).pass
    const isPass = passLike === true
    out.push({
      time,
      position: 'aboveBar',
      shape: isPass ? 'arrowUp' : 'arrowDown',
      color: isPass ? passColor : failColor,
      text: w.label,
    })
  }
  return out
}

export function WFOEquityTV(props: WFOEquityTVProps) {
  const { composite_equity, composite_dates, windows, compact = false } = props
  const theme = useChartTheme()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  const isPositive = useMemo(() => {
    const first = composite_equity[0] ?? 0
    const last = composite_equity[composite_equity.length - 1] ?? 0
    return last >= first
  }, [composite_equity])

  const equityData = useMemo(
    () => toLineData(composite_dates, composite_equity),
    [composite_dates, composite_equity],
  )

  const markers = useMemo(
    () => makeWindowMarkers(windows, theme.success, theme.danger),
    [windows, theme.success, theme.danger],
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChart(container, { autoSize: true, ...chartThemeToOptions(theme) })
    chartRef.current = chart
    const series = chart.addSeries(AreaSeries, equityAreaOptions(theme, isPositive))
    seriesRef.current = series
    markersPluginRef.current = createSeriesMarkers(series, [])
    return () => {
      markersPluginRef.current = null
      seriesRef.current = null
      chart.remove()
      chartRef.current = null
    }
    // create-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    chart.applyOptions(chartThemeToOptions(theme))
    series.applyOptions(equityAreaOptions(theme, isPositive))
  }, [theme, isPositive])

  useEffect(() => {
    seriesRef.current?.setData(equityData)
    markersPluginRef.current?.setMarkers(markers)
    const first = equityData[0]?.time
    const last = equityData[equityData.length - 1]?.time
    if (first != null && last != null) {
      chartRef.current?.timeScale().setVisibleRange({ from: first, to: last })
    }
  }, [equityData, markers])

  const height = compact ? 220 : 300

  return (
    <div
      data-testid="wfo-equity-tv"
      ref={containerRef}
      role="img"
      aria-label={`WFO OOS composite equity, ${equityData.length} points, ${windows.length} windows`}
      style={{ width: '100%', height }}
    />
  )
}
