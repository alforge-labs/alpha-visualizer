import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts'

import { useChartTheme } from '../../design/useChartTheme'
import { chartThemeToOptions } from './theme'
import type { Lang } from '../../i18n/strings'
import { toLineData } from './data'

export interface CompareEquityTVSeries {
  id: string
  label: string
  values: number[]
  dates: string[]
  color: string
  isBaseline: boolean
}

export interface CompareEquityTVProps {
  series: CompareEquityTVSeries[]
  height?: number
  /** 時間軸ロケールの切替（issue #315） */
  lang: Lang
}

/** 各 series の最初の値で正規化し %差し引き表記に */
function normalize(values: number[]): number[] {
  const base = values[0]
  if (base === undefined || base === 0) return values
  return values.map((v) => (v / base - 1) * 100)
}

function makeNormalizedLineData(s: CompareEquityTVSeries): LineData[] {
  return toLineData(s.dates, normalize(s.values))
}

export function CompareEquityTV(props: CompareEquityTVProps) {
  const { series, height = 320, lang } = props
  const theme = useChartTheme()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  /** id → ISeriesApi の対応を保持し、props.series 変更時に reconcile する */
  const seriesMapRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  const linesData = useMemo(
    () =>
      series.map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        isBaseline: s.isBaseline,
        data: makeNormalizedLineData(s),
      })),
    [series],
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChart(container, { autoSize: true, ...chartThemeToOptions(theme, lang) })
    chartRef.current = chart
    const seriesMap = seriesMapRef.current
    return () => {
      seriesMap.clear()
      chart.remove()
      chartRef.current = null
    }
    // create-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.applyOptions(chartThemeToOptions(theme, lang))
    for (const entry of linesData) {
      const seriesApi = seriesMapRef.current.get(entry.id)
      seriesApi?.applyOptions({ color: entry.color })
    }
  }, [theme, linesData, lang])

  // props.series が変わるたびに reconcile: 不要 series 削除 / 新規 series 追加 / setData
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const wanted = new Set(linesData.map((l) => l.id))

    // 1) 不要な series を削除
    for (const [id, api] of seriesMapRef.current.entries()) {
      if (!wanted.has(id)) {
        chart.removeSeries(api)
        seriesMapRef.current.delete(id)
      }
    }

    // 2) 新規追加 + データ反映
    for (const entry of linesData) {
      let api = seriesMapRef.current.get(entry.id)
      if (!api) {
        api = chart.addSeries(LineSeries, {
          color: entry.color,
          lineWidth: entry.isBaseline ? 3 : 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        seriesMapRef.current.set(entry.id, api)
      } else {
        api.applyOptions({
          color: entry.color,
          lineWidth: entry.isBaseline ? 3 : 2,
        })
      }
      api.setData(entry.data)
    }

    // 3) viewport を全 series の合計 time range に合わせる。
    // `dateStringToTime` の挙動上、Time は string ('YYYY-MM-DD') か number
    // (UTCTimestamp) のいずれかで、両者が混在することはない (BusinessDay オブ
    // ジェクトは返さない)。同型なら大小比較が正しく動く前提で min/max を取る。
    const allTimes: Array<string | number> = []
    for (const entry of linesData) {
      const first = entry.data[0]?.time
      const last = entry.data[entry.data.length - 1]?.time
      if (typeof first === 'string' || typeof first === 'number') allTimes.push(first)
      if (typeof last === 'string' || typeof last === 'number') allTimes.push(last)
    }
    if (allTimes.length > 0) {
      const from = allTimes.reduce<string | number>((a, b) => (a < b ? a : b), allTimes[0]!)
      const to = allTimes.reduce<string | number>((a, b) => (a > b ? a : b), allTimes[0]!)
      chart.timeScale().setVisibleRange({ from: from as Time, to: to as Time })
    }
  }, [linesData])

  return (
    <div
      data-testid="compare-equity-tv"
      role="group"
      aria-label={`Compare equity chart, ${series.length} strategies`}
      style={{ position: 'relative' }}
    >
      <div ref={containerRef} style={{ width: '100%', height }} />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 8,
          paddingLeft: 8,
          fontFamily: theme.mono,
          fontSize: 'var(--fs-mono-sm)',
        }}
      >
        {series.map((s) => (
          <span
            key={s.id}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.text2 }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 2,
                background: s.color,
                borderRadius: 1,
              }}
            />
            {s.label}
            {s.isBaseline && (
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent-glow)',
                  color: 'var(--accent)',
                }}
              >
                Base
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
