import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `lightweight-charts` 全体をモック化する。jsdom には Canvas が無く createChart は実行できないため。
// vi.mock のファクトリは top にホイストされるので、参照する mock 関数も vi.hoisted で持ち上げる。
const mocks = vi.hoisted(() => {
  const setDataMock = vi.fn()
  const setMarkersMock = vi.fn()
  const applyOptionsMock = vi.fn()
  const setVisibleRangeMock = vi.fn()
  const removeMock = vi.fn()
  const removeSeriesMock = vi.fn()
  const takeScreenshotMock = vi.fn(() => globalThis.document?.createElement?.('canvas'))
  const addSeriesMock = vi.fn(() => ({
    setData: setDataMock,
    applyOptions: applyOptionsMock,
    setMarkers: setMarkersMock,
  }))
  const createChartMock = vi.fn(() => ({
    remove: removeMock,
    addSeries: addSeriesMock,
    removeSeries: removeSeriesMock,
    applyOptions: applyOptionsMock,
    takeScreenshot: takeScreenshotMock,
    timeScale: () => ({ setVisibleRange: setVisibleRangeMock }),
  }))
  const createSeriesMarkersMock = vi.fn(() => ({ setMarkers: setMarkersMock }))
  return {
    setDataMock,
    setMarkersMock,
    applyOptionsMock,
    setVisibleRangeMock,
    removeMock,
    removeSeriesMock,
    takeScreenshotMock,
    addSeriesMock,
    createChartMock,
    createSeriesMarkersMock,
  }
})

vi.mock('lightweight-charts', () => ({
  AreaSeries: 'AreaSeriesDef',
  LineSeries: 'LineSeriesDef',
  HistogramSeries: 'HistogramSeriesDef',
  ColorType: { Solid: 'solid' },
  LineStyle: { Dotted: 0, Dashed: 1, Solid: 2 },
  createChart: mocks.createChartMock,
  createSeriesMarkers: mocks.createSeriesMarkersMock,
}))

const {
  setDataMock,
  setMarkersMock,
  applyOptionsMock,
  setVisibleRangeMock,
  removeMock,
  removeSeriesMock,
  takeScreenshotMock,
  addSeriesMock,
  createChartMock,
  createSeriesMarkersMock,
} = mocks

import { EquityDrawdownPaneTV } from '../EquityDrawdownPaneTV'

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  setMarkersMock.mockClear()
  applyOptionsMock.mockClear()
  setVisibleRangeMock.mockClear()
  removeMock.mockClear()
  removeSeriesMock.mockClear()
  takeScreenshotMock.mockClear()
  createSeriesMarkersMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleEquity = Array.from({ length: 30 }, (_, i) => 100 + i)
const sampleDrawdown = Array.from({ length: 30 }, (_, i) => -i * 0.1)
const sampleDates = Array.from(
  { length: 30 },
  (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`,
)

describe('EquityDrawdownPaneTV', () => {
  it('マウント時に createChart と 2 系列 (equity + drawdown) を生成する', () => {
    render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    // Strict Mode の double-mount は test 環境ではデフォルト無効。1 回呼ばれる。
    expect(createChartMock).toHaveBeenCalledTimes(1)
    expect(addSeriesMock).toHaveBeenCalledWith('AreaSeriesDef', expect.any(Object), 0)
    expect(addSeriesMock).toHaveBeenCalledWith('HistogramSeriesDef', expect.any(Object), 1)
    expect(createSeriesMarkersMock).toHaveBeenCalledTimes(1)
  })

  it('equity / drawdown データを setData で渡す', () => {
    render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    expect(setDataMock).toHaveBeenCalled()
    const allDataCalls = setDataMock.mock.calls.map((args) => args[0])
    // 少なくとも equity と drawdown の 2 種類のデータが渡される
    expect(allDataCalls.length).toBeGreaterThanOrEqual(2)
    // 各 setData 呼び出しは { time, value }[] を引数に取る
    for (const dataArg of allDataCalls) {
      expect(Array.isArray(dataArg)).toBe(true)
      if (dataArg.length > 0) {
        expect(dataArg[0]).toHaveProperty('time')
        expect(dataArg[0]).toHaveProperty('value')
      }
    }
  })

  it('showBenchmark=true で LineSeries (benchmark) も生やす', () => {
    const benchmark = sampleEquity.map((v) => v * 1.05)
    render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
        benchmark={benchmark}
        showBenchmark
      />,
    )
    expect(addSeriesMock).toHaveBeenCalledWith('LineSeriesDef', expect.any(Object), 0)
  })

  it('IS/OOS マーカーを cutoff 位置に setMarkers する', () => {
    render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    const markerCalls = setMarkersMock.mock.calls
    expect(markerCalls.length).toBeGreaterThan(0)
    const lastCall = markerCalls[markerCalls.length - 1]?.[0]
    expect(Array.isArray(lastCall)).toBe(true)
  })

  it('timeScale().setVisibleRange を呼んで viewport を反映する', () => {
    render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    expect(setVisibleRangeMock).toHaveBeenCalled()
    const call = setVisibleRangeMock.mock.calls[0]?.[0]
    expect(call).toBeDefined()
    expect(call).toHaveProperty('from')
    expect(call).toHaveProperty('to')
  })

  it('unmount で chart.remove() を呼ぶ', () => {
    const { unmount } = render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    expect(removeMock).not.toHaveBeenCalled()
    unmount()
    expect(removeMock).toHaveBeenCalledTimes(1)
  })

  it('aria-label を含む role=img 要素を描画する', () => {
    render(
      <EquityDrawdownPaneTV
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    const region = screen.getByRole('img')
    expect(region.getAttribute('aria-label')).toMatch(/Equity and drawdown chart/)
  })
})
