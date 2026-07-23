import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `lightweight-charts` 全体をモック化する。jsdom には Canvas が無く createChart は実行できないため。
// vi.mock のファクトリは top にホイストされるので、参照する mock 関数も vi.hoisted で持ち上げる。
const mocks = vi.hoisted(() => {
  const setDataMock = vi.fn()
  const setMarkersMock = vi.fn()
  const applyOptionsMock = vi.fn()
  const setVisibleRangeMock = vi.fn()
  const subscribeRangeMock = vi.fn()
  const unsubscribeRangeMock = vi.fn()
  const removeMock = vi.fn()
  const removeSeriesMock = vi.fn()
  const takeScreenshotMock = vi.fn(() => globalThis.document?.createElement?.('canvas'))
  const attachPrimitiveMock = vi.fn()
  const detachPrimitiveMock = vi.fn()
  const addSeriesMock = vi.fn(() => ({
    setData: setDataMock,
    applyOptions: applyOptionsMock,
    setMarkers: setMarkersMock,
    attachPrimitive: attachPrimitiveMock,
    detachPrimitive: detachPrimitiveMock,
  }))
  const createChartMock = vi.fn(() => ({
    remove: removeMock,
    addSeries: addSeriesMock,
    removeSeries: removeSeriesMock,
    applyOptions: applyOptionsMock,
    takeScreenshot: takeScreenshotMock,
    // issue #318: 双方向 viewport sync が購読する API
    timeScale: () => ({
      setVisibleRange: setVisibleRangeMock,
      subscribeVisibleTimeRangeChange: subscribeRangeMock,
      unsubscribeVisibleTimeRangeChange: unsubscribeRangeMock,
    }),
  }))
  const createSeriesMarkersMock = vi.fn(() => ({ setMarkers: setMarkersMock }))
  return {
    setDataMock,
    setMarkersMock,
    applyOptionsMock,
    setVisibleRangeMock,
    subscribeRangeMock,
    unsubscribeRangeMock,
    removeMock,
    removeSeriesMock,
    takeScreenshotMock,
    addSeriesMock,
    createChartMock,
    createSeriesMarkersMock,
    attachPrimitiveMock,
    detachPrimitiveMock,
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
  attachPrimitiveMock,
  detachPrimitiveMock,
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
  attachPrimitiveMock.mockClear()
  detachPrimitiveMock.mockClear()
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
        lang="ja"
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
        lang="ja"
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
        lang="ja"
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
        lang="ja"
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
        lang="ja"
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
        lang="ja"
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
        lang="ja"
        equity={sampleEquity}
        dates={sampleDates}
        drawdown={sampleDrawdown}
        isCutoffIdx={15}
      />,
    )
    const region = screen.getByRole('group', { name: /Equity and drawdown chart/ })
    expect(region.getAttribute('aria-label')).toMatch(/Equity and drawdown chart/)
  })

  /**
   * issue #315: EN 切替後もチャート時間軸が日本語（「2021年」等）のまま残り、
   * Data table ラベルが常に日英併記になる。lang prop で locale と表記を切り替える。
   */
  describe('lang (issue #315)', () => {
    it("lang='en' のとき createChart に locale en-US を渡す", () => {
      render(
        <EquityDrawdownPaneTV
          equity={sampleEquity}
          dates={sampleDates}
          drawdown={sampleDrawdown}
          isCutoffIdx={15}
          lang="en"
        />,
      )
      const options = (createChartMock.mock.calls[0] as unknown[])?.[1] as {
        localization?: { locale?: string }
      }
      expect(options?.localization?.locale).toBe('en-US')
    })

    it("lang='ja' のとき createChart に locale ja-JP を渡す", () => {
      render(
        <EquityDrawdownPaneTV
          equity={sampleEquity}
          dates={sampleDates}
          drawdown={sampleDrawdown}
          isCutoffIdx={15}
          lang="ja"
        />,
      )
      const options = (createChartMock.mock.calls[0] as unknown[])?.[1] as {
        localization?: { locale?: string }
      }
      expect(options?.localization?.locale).toBe('ja-JP')
    })

    it("lang='en' のとき Data table ラベルは英語のみ", () => {
      render(
        <EquityDrawdownPaneTV
          equity={sampleEquity}
          dates={sampleDates}
          drawdown={sampleDrawdown}
          isCutoffIdx={15}
          lang="en"
        />,
      )
      expect(screen.getByText('Data table')).toBeInTheDocument()
      expect(screen.queryByText(/データ表/)).not.toBeInTheDocument()
    })

    it("lang='ja' のとき Data table ラベルは日本語のみ", () => {
      render(
        <EquityDrawdownPaneTV
          equity={sampleEquity}
          dates={sampleDates}
          drawdown={sampleDrawdown}
          isCutoffIdx={15}
          lang="ja"
        />,
      )
      expect(screen.getByText('データ表')).toBeInTheDocument()
      expect(screen.queryByText(/Data table/)).not.toBeInTheDocument()
    })
  })

  /**
   * issue #317: #187 の visx 撤去でレジーム背景表示が失われていた。
   * showRegime のときだけ背景バンド primitive を attach し、凡例を出す。
   */
  describe('regime bands (issue #317)', () => {
    const regimeSeries = {
      dates: sampleDates,
      states: sampleDates.map((_, i) => (i < 15 ? 0 : 1)),
      n_states: 2,
      label_names: { '0': 'Range', '1': 'Trend' },
    }

    function renderPane(props: Record<string, unknown> = {}) {
      return render(
        <EquityDrawdownPaneTV
          equity={sampleEquity}
          dates={sampleDates}
          drawdown={sampleDrawdown}
          isCutoffIdx={15}
          lang="ja"
          {...props}
        />,
      )
    }

    it('showRegime=true で背景バンド primitive を attach する', () => {
      renderPane({ regimeSeries, showRegime: true })
      expect(attachPrimitiveMock).toHaveBeenCalledTimes(1)
    })

    it('showRegime=false では attach しない', () => {
      renderPane({ regimeSeries, showRegime: false })
      expect(attachPrimitiveMock).not.toHaveBeenCalled()
    })

    it('regimeSeries が無ければ showRegime=true でも attach しない', () => {
      renderPane({ showRegime: true })
      expect(attachPrimitiveMock).not.toHaveBeenCalled()
    })

    it('showRegime を切ると detach する（バンドが残らない）', () => {
      const { rerender } = renderPane({ regimeSeries, showRegime: true })
      expect(detachPrimitiveMock).not.toHaveBeenCalled()

      rerender(
        <EquityDrawdownPaneTV
          equity={sampleEquity}
          dates={sampleDates}
          drawdown={sampleDrawdown}
          isCutoffIdx={15}
          lang="ja"
          regimeSeries={regimeSeries}
          showRegime={false}
        />,
      )
      expect(detachPrimitiveMock).toHaveBeenCalledTimes(1)
    })

    it('凡例に label_names のラベルを表示する', () => {
      renderPane({ regimeSeries, showRegime: true })
      expect(screen.getByText('Range')).toBeInTheDocument()
      expect(screen.getByText('Trend')).toBeInTheDocument()
    })

    it('showRegime=false では凡例を出さない', () => {
      renderPane({ regimeSeries, showRegime: false })
      expect(screen.queryByText('Range')).not.toBeInTheDocument()
    })
  })
})
