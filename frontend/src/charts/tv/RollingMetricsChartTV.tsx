import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'

import { useDashboard } from '../../contexts/DashboardContext'
import { RANGE_N } from '../../contexts/dashboardConstants'
import { useChartTheme } from '../../design/useChartTheme'
import { computeRollingSharpe } from '../../lib/rolling'
import { chartThemeToOptions } from './theme'
import { toLineData } from './data'

const WINDOWS = [30, 60, 90] as const
type WindowOption = (typeof WINDOWS)[number]

export interface RollingMetricsChartTVProps {
  dailyReturns: number[]
  dates: string[]
  compact?: boolean
}

function buildSlicedSeries(
  dailyReturns: number[],
  dates: string[],
  win: WindowOption,
  rangeBars: number,
): { dates: string[]; values: number[] } {
  const sharpe = computeRollingSharpe(dailyReturns, win)
  const n = sharpe.length
  const start = Math.max(0, n - Math.min(rangeBars, n))
  const slicedDates: string[] = []
  const slicedValues: number[] = []
  for (let i = start; i < n; i++) {
    const v = sharpe[i]
    if (v == null) continue
    const d = dates[i + 1] ?? dates[i]
    if (!d) continue
    slicedDates.push(d)
    slicedValues.push(v)
  }
  return { dates: slicedDates, values: slicedValues }
}

export function RollingMetricsChartTV(props: RollingMetricsChartTVProps) {
  const { dailyReturns, dates, compact = false } = props
  const { selectedRange } = useDashboard()
  const theme = useChartTheme()
  const [win, setWin] = useState<WindowOption>(60)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  const sliced = useMemo(
    () => buildSlicedSeries(dailyReturns, dates, win, RANGE_N[selectedRange]),
    [dailyReturns, dates, win, selectedRange],
  )

  const lineData = useMemo(() => toLineData(sliced.dates, sliced.values), [sliced])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChart(container, { autoSize: true, ...chartThemeToOptions(theme) })
    chartRef.current = chart
    const series = chart.addSeries(LineSeries, {
      color: theme.accent,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    seriesRef.current = series
    return () => {
      seriesRef.current = null
      chart.remove()
      chartRef.current = null
    }
    // create-once: theme / props 変更は別 effect で applyOptions / setData する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    chart.applyOptions(chartThemeToOptions(theme))
    series.applyOptions({ color: theme.accent })
  }, [theme])

  useEffect(() => {
    seriesRef.current?.setData(lineData)
    const first = lineData[0]?.time
    const last = lineData[lineData.length - 1]?.time
    if (first != null && last != null) {
      chartRef.current?.timeScale().setVisibleRange({ from: first, to: last })
    }
  }, [lineData])

  const height = compact ? 200 : 240

  return (
    <div data-testid="rolling-metrics-tv" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {WINDOWS.map((w) => {
          const active = w === win
          return (
            <button
              key={w}
              type="button"
              onClick={() => setWin(w)}
              style={{
                height: 24,
                padding: '0 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                fontWeight: 600,
                letterSpacing: 'var(--tracking-mono)',
                background: active ? 'var(--accent-bg)' : 'transparent',
                border: active ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
                color: active ? 'var(--accent)' : 'var(--text3)',
                transition: 'all var(--motion-fast)',
              }}
            >
              {w}d
            </button>
          )
        })}
      </div>
      <div
        ref={containerRef}
        role="img"
        aria-label={`Rolling Sharpe (${win}-day window), ${lineData.length} points`}
        style={{ width: '100%', height }}
      />
    </div>
  )
}
