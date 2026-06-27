import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OhlcBar, Trade } from '../../../api/types'

// `lightweight-charts` 全体をモック化（jsdom には Canvas が無く createChart は実行できない）。
const mocks = vi.hoisted(() => {
  const setDataMock = vi.fn()
  const setMarkersMock = vi.fn()
  const applyOptionsMock = vi.fn()
  const setVisibleRangeMock = vi.fn()
  const removeMock = vi.fn()
  const takeScreenshotMock = vi.fn(() => globalThis.document?.createElement?.('canvas'))
  const createPriceLineMock = vi.fn((options) => ({ id: Symbol('priceLine'), options }))
  const removePriceLineMock = vi.fn()
  const addSeriesMock = vi.fn(() => ({
    setData: setDataMock,
    applyOptions: applyOptionsMock,
    setMarkers: setMarkersMock,
    createPriceLine: createPriceLineMock,
    removePriceLine: removePriceLineMock,
  }))
  const createChartMock = vi.fn(() => ({
    remove: removeMock,
    addSeries: addSeriesMock,
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
    takeScreenshotMock,
    createPriceLineMock,
    removePriceLineMock,
    addSeriesMock,
    createChartMock,
    createSeriesMarkersMock,
  }
})

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'CandlestickSeriesDef',
  ColorType: { Solid: 'solid' },
  LineStyle: { Dotted: 0, Dashed: 1, Solid: 2 },
  createChart: mocks.createChartMock,
  createSeriesMarkers: mocks.createSeriesMarkersMock,
}))

const {
  setDataMock,
  setMarkersMock,
  removeMock,
  createPriceLineMock,
  removePriceLineMock,
  addSeriesMock,
  createChartMock,
  createSeriesMarkersMock,
} = mocks

import { StrategySignalChartTV } from '../StrategySignalChartTV'

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  setMarkersMock.mockClear()
  removeMock.mockClear()
  createPriceLineMock.mockClear()
  removePriceLineMock.mockClear()
  createSeriesMarkersMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleBars: OhlcBar[] = Array.from({ length: 10 }, (_, i) => ({
  time: `2025-01-${String(i + 2).padStart(2, '0')}`,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 1_000_000,
}))

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: 0,
    direction: 'long',
    entry_date: '2025-01-03',
    exit_date: '2025-01-07',
    entry_price: 101,
    exit_price: 108,
    sl_price: 99,
    tp_price: 110,
    return_pct: 7,
    pnl: 700,
    holding_days: 4,
    mae_pct: -1.0,
    mfe_pct: 8.0,
    ...overrides,
  }
}

describe('StrategySignalChartTV', () => {
  it('マウント時に createChart + CandlestickSeries + markers plugin を生成する', () => {
    render(<StrategySignalChartTV bars={sampleBars} trades={[]} />)
    expect(createChartMock).toHaveBeenCalledTimes(1)
    expect(addSeriesMock).toHaveBeenCalledWith('CandlestickSeriesDef', expect.any(Object), 0)
    expect(createSeriesMarkersMock).toHaveBeenCalledTimes(1)
  })

  it('OHLC データを CandlestickData 形式で setData に渡す', () => {
    render(<StrategySignalChartTV bars={sampleBars} trades={[]} />)
    expect(setDataMock).toHaveBeenCalled()
    const data = setDataMock.mock.calls[0]?.[0]
    expect(Array.isArray(data)).toBe(true)
    expect(data[0]).toMatchObject({
      time: '2025-01-02',
      open: 100,
      high: 102,
      low: 99,
      close: 101,
    })
  })

  it('trades 配列から markers を計算して setMarkers に渡す', () => {
    render(
      <StrategySignalChartTV
        bars={sampleBars}
        trades={[trade({}), trade({ id: 1, entry_date: '2025-01-05', exit_date: '2025-01-09' })]}
      />,
    )
    expect(setMarkersMock).toHaveBeenCalled()
    const markers = setMarkersMock.mock.calls[setMarkersMock.mock.calls.length - 1]?.[0]
    // 2 closed trades → 4 markers
    expect(markers).toHaveLength(4)
  })

  it('focus trade に entry / sl / tp priceLine を createPriceLine で作る', () => {
    render(
      <StrategySignalChartTV bars={sampleBars} trades={[trade({ sl_price: 99, tp_price: 110 })]} />,
    )
    // entry + sl + tp の 3 本
    expect(createPriceLineMock).toHaveBeenCalledTimes(3)
    const titles = createPriceLineMock.mock.calls.map((args) => args[0].title)
    expect(titles.sort()).toEqual(['SL', 'TP', 'entry'])
  })

  it('trades 変更で removePriceLine → createPriceLine で priceLine を更新する', () => {
    const { rerender } = render(
      <StrategySignalChartTV bars={sampleBars} trades={[trade({ sl_price: 99, tp_price: 110 })]} />,
    )
    createPriceLineMock.mockClear()
    removePriceLineMock.mockClear()

    rerender(
      <StrategySignalChartTV
        bars={sampleBars}
        trades={[trade({ id: 99, sl_price: 95, tp_price: 115 })]}
      />,
    )
    // 古い 3 本 (entry/sl/tp) を remove して、新しい 3 本を create
    expect(removePriceLineMock).toHaveBeenCalledTimes(3)
    expect(createPriceLineMock).toHaveBeenCalledTimes(3)
  })

  it('trades が空でも priceLine は 0 本（focus trade が null）', () => {
    render(<StrategySignalChartTV bars={sampleBars} trades={[]} />)
    expect(createPriceLineMock).not.toHaveBeenCalled()
  })

  it('unmount で chart.remove() を 1 回呼ぶ', () => {
    const { unmount } = render(<StrategySignalChartTV bars={sampleBars} trades={[]} />)
    expect(removeMock).not.toHaveBeenCalled()
    unmount()
    expect(removeMock).toHaveBeenCalledTimes(1)
  })

  it('aria-label にバー数とトレード数が含まれる', () => {
    const { getByTestId } = render(
      <StrategySignalChartTV bars={sampleBars} trades={[trade({})]} />,
    )
    const el = getByTestId('strategy-signal-chart-tv').closest('figure')
    expect(el?.getAttribute('aria-label')).toContain('10 bars')
    expect(el?.getAttribute('aria-label')).toContain('1 trades')
  })

  it('OHLC データテーブルを代替として描画する (issue #262)', () => {
    const { getByRole, getAllByRole } = render(
      <StrategySignalChartTV bars={sampleBars} trades={[]} />,
    )
    expect(getByRole('columnheader', { name: 'Open' })).toBeInTheDocument()
    expect(getByRole('columnheader', { name: 'Close' })).toBeInTheDocument()
    // 10 bars → ヘッダ + 10 行以上
    expect(getAllByRole('row').length).toBeGreaterThanOrEqual(10)
  })

  it('showRegime=true で regime 切替点 marker が trade markers と merge される', () => {
    const regimeSeries = {
      dates: ['2025-01-02', '2025-01-04', '2025-01-08'],
      states: [0, 1, 0],
      n_states: 2,
    }
    render(
      <StrategySignalChartTV
        bars={sampleBars}
        trades={[trade({})]}
        regimeSeries={regimeSeries}
        showRegime
      />,
    )
    const lastCall = setMarkersMock.mock.calls[setMarkersMock.mock.calls.length - 1]?.[0]
    // 2 trade markers + 2 regime change markers
    expect(lastCall).toHaveLength(4)
    expect(lastCall.some((m: { shape: string }) => m.shape === 'circle')).toBe(true)
  })

  it('showRegime=false なら regimeSeries が渡されても無視', () => {
    const regimeSeries = {
      dates: ['2025-01-02', '2025-01-04'],
      states: [0, 1],
      n_states: 2,
    }
    render(
      <StrategySignalChartTV
        bars={sampleBars}
        trades={[trade({})]}
        regimeSeries={regimeSeries}
        showRegime={false}
      />,
    )
    const lastCall = setMarkersMock.mock.calls[setMarkersMock.mock.calls.length - 1]?.[0]
    // 2 trade markers のみ
    expect(lastCall).toHaveLength(2)
    expect(lastCall.every((m: { shape: string }) => m.shape !== 'circle')).toBe(true)
  })

  it('aria-label に regime changes 数が含まれる（showRegime=true 時）', () => {
    const regimeSeries = {
      dates: ['2025-01-02', '2025-01-04', '2025-01-08'],
      states: [0, 1, 0],
      n_states: 2,
    }
    const { getByTestId } = render(
      <StrategySignalChartTV
        bars={sampleBars}
        trades={[]}
        regimeSeries={regimeSeries}
        showRegime
      />,
    )
    const label = getByTestId('strategy-signal-chart-tv').closest('figure')?.getAttribute('aria-label')
    expect(label).toContain('2 regime changes')
  })
})
