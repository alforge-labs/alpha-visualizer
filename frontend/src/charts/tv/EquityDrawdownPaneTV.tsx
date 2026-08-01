import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  PriceScaleMode,
} from 'lightweight-charts'

import { RANGES } from '../../contexts/dashboardConstants'
import { ChartDataTable } from '../../design/primitives/ChartDataTable'
import { useChartTheme } from '../../design/useChartTheme'
import { useEquityViewport } from '../../hooks/useEquityViewport'
import { useSyncedTimeRange } from '../../hooks/useSyncedTimeRange'
import { makeL, type Lang } from '../../i18n/strings'
import type { RegimeSeries } from '../../api/types'
import { createRegimeBandsPrimitive, type RegimeBandsPrimitive } from './regimeBands'
import {
  benchmarkLineOptions,
  chartThemeToOptions,
  drawdownHistogramOptions,
  equityAreaOptions,
  hexToRgba,
  overlayLineOptions,
} from './theme'
import { fromViewportPoints, makeCutoffMarkers, toHistogramData } from './data'

/** レジーム背景の不透明度。エクイティ線とドローダウンを覆い隠さない濃さに留める */
const REGIME_BAND_ALPHA = 0.14

/**
 * equity と並走させる比較用オーバーレイ系列（例: 別ベンチマーク・BT併走曲線）。
 * 既存の `benchmark` / `showBenchmark` とは独立した多系列比較機能（複数同時表示可）。
 */
export interface EquityOverlay {
  label: string
  values: number[]
  color?: string
  /** 破線で描くか（既定 false） */
  dashed?: boolean
}

export interface EquityDrawdownPaneTVProps {
  equity: number[]
  dates: string[]
  drawdown: number[]
  isCutoffIdx: number
  benchmark?: number[]
  showBenchmark?: boolean
  /** equity と並走する追加比較系列（issue の多系列比較・任意本数） */
  overlays?: EquityOverlay[]
  compact?: boolean
  /** レジーム背景バンドの元データ（issue #317） */
  regimeSeries?: RegimeSeries | null
  /** レジーム背景バンドを表示するか（既定 false） */
  showRegime?: boolean
  /** 時間軸ロケールと Data table 表記の切替（issue #315） */
  lang: Lang
  ref?: React.Ref<EquityDrawdownPaneTVHandle>
}

export interface EquityDrawdownPaneTVHandle {
  /** lightweight-charts の Canvas を PNG として保存する。 */
  exportPng: (filename: string) => void
}

export function EquityDrawdownPaneTV(props: EquityDrawdownPaneTVProps) {
  const {
    equity,
    dates,
    drawdown,
    isCutoffIdx,
    benchmark,
    showBenchmark = false,
    overlays,
    compact = false,
    regimeSeries,
    showRegime = false,
    lang,
    ref,
  } = props

  const L = makeL(lang)
  const theme = useChartTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  // issue #378: 対数スケール切替。長期 equity の複利成長（傾きの一貫性）を
  // 確認できるようにする（lightweight-charts の PriceScaleMode 切替のみ）
  const [logScale, setLogScale] = useState(false)
  // hook に渡すには再レンダーを起こす必要があるため、ref とは別に state でも保持する
  const [chartApi, setChartApi] = useState<IChartApi | null>(null)
  const equitySeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const benchmarkSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const drawdownSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const regimePrimitiveRef = useRef<RegimeBandsPrimitive | null>(null)
  // overlays は本数・並び順が変わり得るため label をキーにした Map で差分管理する
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  const { range, setRange, points } = useEquityViewport({ equity, dates, benchmark, overlays })

  const isPositive = useMemo(() => {
    if (points.length < 2) return true
    const first = points[0]?.value ?? 0
    const last = points[points.length - 1]?.value ?? 0
    return last >= first
  }, [points])

  const overlayCount = overlays?.length ?? 0

  const { equityData, benchmarkData, overlayData, drawdownData, markers } = useMemo(() => {
    const conv = fromViewportPoints(points, overlayCount)
    const ddSlicedDates = points.map((p) => p.date.toISOString().slice(0, 10))
    const ddSlicedValues = points.map((p) => drawdown[p.origIdx] ?? 0)
    const drawdownDataLocal = toHistogramData(ddSlicedDates, ddSlicedValues)
    const times = conv.equity.map((d) => d.time)
    const markersLocal = makeCutoffMarkers(conv.origIndices, isCutoffIdx, times, theme.text2)
    return {
      equityData: conv.equity,
      benchmarkData: conv.benchmark,
      // overlays[j] の LineData 列。points と同じ origIdx で切り出し済み（useEquityViewport 側）
      overlayData: conv.overlays,
      drawdownData: drawdownDataLocal,
      markers: markersLocal,
    }
  }, [points, drawdown, isCutoffIdx, theme.text2, overlayCount])

  // チャートのライフサイクル管理。マウント時に一度だけ create / remove。
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    // cleanup 実行時点の ref.current 参照ではなく、mount 時点のインスタンスを閉じ込めておく
    // （react-hooks/exhaustive-deps 対策。overlaySeriesRef.current 自体を差し替えることはない）
    const overlayMap = overlaySeriesRef.current
    const chart = createChart(container, {
      autoSize: true,
      ...chartThemeToOptions(theme, lang),
    })
    chartRef.current = chart
    setChartApi(chart)

    const equitySeries = chart.addSeries(
      AreaSeries,
      equityAreaOptions(theme, isPositive),
      0,
    )
    equitySeriesRef.current = equitySeries

    const drawdownSeries = chart.addSeries(
      HistogramSeries,
      drawdownHistogramOptions(theme),
      1,
    )
    drawdownSeriesRef.current = drawdownSeries

    markersPluginRef.current = createSeriesMarkers(equitySeries, [])

    return () => {
      markersPluginRef.current = null
      equitySeriesRef.current = null
      benchmarkSeriesRef.current = null
      drawdownSeriesRef.current = null
      overlayMap.clear()
      chart.remove()
      chartRef.current = null
      setChartApi(null)
    }
    // create-once: theme / isPositive の更新は別 effect で applyOptions する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // issue #378: Lin/Log スケール切替（equity ペインの価格軸のみ）
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    })
  }, [logScale])

  // テーマ / 言語変更で chart / series の見た目だけ更新（再マウントしない）。
  useEffect(() => {
    const chart = chartRef.current
    const equitySeries = equitySeriesRef.current
    const drawdownSeries = drawdownSeriesRef.current
    if (!chart || !equitySeries || !drawdownSeries) return
    chart.applyOptions(chartThemeToOptions(theme, lang))
    equitySeries.applyOptions(equityAreaOptions(theme, isPositive))
    drawdownSeries.applyOptions(drawdownHistogramOptions(theme))
    if (benchmarkSeriesRef.current) {
      benchmarkSeriesRef.current.applyOptions(benchmarkLineOptions(theme))
    }
  }, [theme, isPositive, lang])

  // showBenchmark の切替: 必要な時に series を生やし、不要時は破棄する。
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const wantBenchmark = showBenchmark && benchmarkData.length > 0
    if (wantBenchmark && !benchmarkSeriesRef.current) {
      benchmarkSeriesRef.current = chart.addSeries(LineSeries, benchmarkLineOptions(theme), 0)
    } else if (!wantBenchmark && benchmarkSeriesRef.current) {
      chart.removeSeries(benchmarkSeriesRef.current)
      benchmarkSeriesRef.current = null
    }
  }, [showBenchmark, benchmarkData.length, theme])

  // overlays の系列生成/破棄。label をキーに差分更新し、不要になった系列は
  // chart.removeSeries() で明示破棄する（lightweight-charts は放置するとリークする）。
  // theme 変更時は色/スタイルの再適用も兼ねる。
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const map = overlaySeriesRef.current
    const wanted = overlays ?? []
    const wantedLabels = new Set(wanted.map((o) => o.label))

    if (wantedLabels.size !== wanted.length) {
      // label は系列 Map のキーなので、重複すると後勝ちで 1 本に潰れる。
      // 系列長不一致を drop するときと同様、黙って消さずに知らせる。
      const seen = new Set<string>()
      const dupes = wanted.map((o) => o.label).filter((l) => {
        if (seen.has(l)) return true
        seen.add(l)
        return false
      })
      console.warn(
        `EquityDrawdownPaneTV: overlays のラベルが重複しています（${[...new Set(dupes)].join(', ')}）。` +
          '同じラベルの系列は 1 本に統合されます。ラベルは系列の識別子なので一意にしてください。',
      )
    }

    for (const [label, series] of map) {
      if (!wantedLabels.has(label)) {
        chart.removeSeries(series)
        map.delete(label)
      }
    }

    // 色は配列位置ではなく**ラベル**で決める。配列位置で決めると、ラベルは
    // そのままで並び順だけ変わったときに系列の色が入れ替わり、線の色で系列を
    // 識別している画面では同じものが別物に見える。ソート済みユニークラベルの
    // 位置を使うことで、並び替えに対して安定させる。
    const colorIndexByLabel = new Map(
      [...wantedLabels].sort().map((label, idx) => [label, idx]),
    )

    wanted.forEach((overlay) => {
      const colorIndex = colorIndexByLabel.get(overlay.label) ?? 0
      const options = overlayLineOptions(theme, colorIndex, overlay.color, overlay.dashed)
      const existing = map.get(overlay.label)
      if (existing) {
        existing.applyOptions(options)
      } else {
        map.set(overlay.label, chart.addSeries(LineSeries, options, 0))
      }
    })
  }, [overlays, theme])

  // issue #317: レジーム背景バンドの attach/detach。
  // primitive は bands をクロージャに持つため、series/表示切替/テーマが変わったら
  // 作り直す（detach → attach）。
  useEffect(() => {
    const equitySeries = equitySeriesRef.current
    if (!equitySeries) return

    if (regimePrimitiveRef.current) {
      equitySeries.detachPrimitive(regimePrimitiveRef.current)
      regimePrimitiveRef.current = null
    }
    if (!showRegime || !regimeSeries) return

    const primitive = createRegimeBandsPrimitive(regimeSeries, theme.series, REGIME_BAND_ALPHA)
    equitySeries.attachPrimitive(primitive)
    regimePrimitiveRef.current = primitive

    return () => {
      if (regimePrimitiveRef.current) {
        equitySeries.detachPrimitive(regimePrimitiveRef.current)
        regimePrimitiveRef.current = null
      }
    }
  }, [showRegime, regimeSeries, theme.series])

  // データ反映
  useEffect(() => {
    equitySeriesRef.current?.setData(equityData)
    drawdownSeriesRef.current?.setData(drawdownData)
    if (showBenchmark && benchmarkSeriesRef.current) {
      benchmarkSeriesRef.current.setData(benchmarkData)
    }
    // overlayData は props.overlays と同じ並び順（fromViewportPoints(points, overlayCount)）
    const wantedOverlays = overlays ?? []
    wantedOverlays.forEach((overlay, i) => {
      overlaySeriesRef.current.get(overlay.label)?.setData(overlayData[i] ?? [])
    })
    markersPluginRef.current?.setMarkers(markers)
  }, [equityData, benchmarkData, overlayData, overlays, drawdownData, markers, showBenchmark])

  // viewport は共有状態と双方向に同期する（issue #318）。
  // 共有範囲が無ければ equity の全範囲（slice 済み）を表示する。
  const fullRange = useMemo(() => {
    const first = equityData[0]?.time
    const last = equityData[equityData.length - 1]?.time
    return first != null && last != null ? { from: first, to: last } : null
  }, [equityData])
  useSyncedTimeRange({ chart: chartApi, fullRange })

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

  // 凡例は DOM 側に描く（canvas 内に描くとテキスト検索・SR 到達性が失われるため）
  const regimeLegend = useMemo(() => {
    if (!showRegime || !regimeSeries) return []
    return createRegimeBandsPrimitive(regimeSeries, theme.series, REGIME_BAND_ALPHA).legend()
  }, [showRegime, regimeSeries, theme.series])

  const height = compact ? 320 : 440

  return (
    <div
      data-testid="equity-drawdown-pane-tv"
      role="group"
      aria-label={`Equity and drawdown chart, ${equity.length} points`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 64,
          flexWrap: 'wrap',
        }}
      >
        {RANGES.map((r) => {
          const active = r === range
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                height: 24,
                padding: '0 10px',
                background: active ? 'var(--accent-bg)' : 'transparent',
                border: active ? '1px solid var(--accent-glow)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                fontWeight: 600,
                letterSpacing: 'var(--tracking-mono)',
                color: active ? 'var(--accent)' : 'var(--text3)',
                transition: 'all var(--motion-fast)',
              }}
            >
              {r}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={logScale}
          title={
            logScale
              ? 'リニアスケールに戻す / Switch to linear scale'
              : '対数スケールで表示 / Switch to log scale'
          }
          onClick={() => setLogScale((v) => !v)}
          style={{
            height: 24,
            padding: '0 10px',
            marginLeft: 8,
            background: logScale ? 'var(--accent-bg)' : 'transparent',
            border: logScale ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            fontWeight: 600,
            letterSpacing: 'var(--tracking-mono)',
            color: logScale ? 'var(--accent)' : 'var(--text3)',
            transition: 'all var(--motion-fast)',
          }}
        >
          Log
        </button>
        {showBenchmark && (
          <div
            style={{
              marginLeft: 12,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
            }}
          >
            <span style={{ color: theme.accent }}>━━ Strategy</span>
            <span>╌╌ Buy &amp; Hold</span>
          </div>
        )}
        {regimeLegend.length > 0 && (
          <div
            data-testid="regime-legend"
            style={{
              marginLeft: 12,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
            }}
          >
            {regimeLegend.map((e) => (
              <span key={e.state} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: hexToRgba(e.color, REGIME_BAND_ALPHA * 3),
                    border: `1px solid ${e.color}`,
                  }}
                />
                {e.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* canvas は素の generic div（role/aria-hidden を付けない）にして nested-interactive /
          aria-hidden-focus を回避。アクセシブル名は親 role="group"、データは ChartDataTable で提供 */}
      <div ref={containerRef} style={{ width: '100%', height }} />

      <ChartDataTable
        label={L('データ表', 'Data table')}
        caption={`Equity and drawdown, ${equity.length} points`}
        columns={['Date', 'Equity', 'DD %', ...(overlays ?? []).map((o) => o.label)]}
        rows={dates.map((d, i) => [
          d,
          Math.round(equity[i] ?? 0).toLocaleString(),
          `${(drawdown[i] ?? 0).toFixed(1)}%`,
          ...(overlays ?? []).map((o) => Math.round(o.values[i] ?? 0).toLocaleString()),
        ])}
      />
    </div>
  )
}
