import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const setDataMock = vi.fn()
  const setMarkersMock = vi.fn()
  const applyOptionsMock = vi.fn()
  const setVisibleRangeMock = vi.fn()
  const removeMock = vi.fn()
  const addSeriesMock = vi.fn(() => ({
    setData: setDataMock,
    applyOptions: applyOptionsMock,
  }))
  const createChartMock = vi.fn(() => ({
    remove: removeMock,
    addSeries: addSeriesMock,
    applyOptions: applyOptionsMock,
    timeScale: () => ({ setVisibleRange: setVisibleRangeMock }),
  }))
  const createSeriesMarkersMock = vi.fn(() => ({ setMarkers: setMarkersMock }))
  return {
    setDataMock,
    setMarkersMock,
    applyOptionsMock,
    setVisibleRangeMock,
    removeMock,
    addSeriesMock,
    createChartMock,
    createSeriesMarkersMock,
  }
})

vi.mock('lightweight-charts', () => ({
  AreaSeries: 'AreaSeriesDef',
  ColorType: { Solid: 'solid' },
  LineStyle: { Dotted: 0, Dashed: 1, Solid: 2 },
  createChart: mocks.createChartMock,
  createSeriesMarkers: mocks.createSeriesMarkersMock,
}))

import { WFOEquityTV } from '../WFOEquityTV'
import type { WFOWindow } from '../../../api/types'

const {
  setDataMock,
  setMarkersMock,
  removeMock,
  addSeriesMock,
  createChartMock,
  createSeriesMarkersMock,
} = mocks

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  setMarkersMock.mockClear()
  removeMock.mockClear()
  createSeriesMarkersMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

const composite_equity = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 8) * 4 + i * 0.2)
const composite_dates = Array.from(
  { length: 60 },
  (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
)
const windows: WFOWindow[] = [
  {
    id: 0,
    label: 'W1',
    is_start: '2024-01-01',
    is_end: '2024-01-10',
    oos_start: '2024-01-11',
    oos_end: '2024-01-20',
    oos_return: 5.2,
    oos_sharpe: 1.4,
    is_sharpe: 1.6,
    params: {},
  } as WFOWindow,
  {
    id: 1,
    label: 'W2',
    is_start: '2024-01-11',
    is_end: '2024-01-20',
    oos_start: '2024-01-21',
    oos_end: '2024-01-28',
    oos_return: -2.1,
    oos_sharpe: -0.3,
    is_sharpe: 0.8,
    params: {},
  } as WFOWindow,
]

describe('WFOEquityTV', () => {
  it('createChart + AreaSeries + マーカープラグインを生成する', () => {
    render(
      <WFOEquityTV
        composite_equity={composite_equity}
        composite_dates={composite_dates}
        windows={windows}
      />,
    )
    expect(createChartMock).toHaveBeenCalledTimes(1)
    expect(addSeriesMock).toHaveBeenCalledWith('AreaSeriesDef', expect.any(Object))
    expect(createSeriesMarkersMock).toHaveBeenCalledTimes(1)
  })

  it('equity データと window マーカーを setData / setMarkers で渡す', () => {
    render(
      <WFOEquityTV
        composite_equity={composite_equity}
        composite_dates={composite_dates}
        windows={windows}
      />,
    )
    expect(setDataMock).toHaveBeenCalled()
    expect(setMarkersMock).toHaveBeenCalled()
    const lastMarkers = setMarkersMock.mock.calls[setMarkersMock.mock.calls.length - 1]?.[0]
    expect(Array.isArray(lastMarkers)).toBe(true)
    expect(lastMarkers).toHaveLength(2)
  })

  it('aria-label に points / windows 数が含まれる', () => {
    render(
      <WFOEquityTV
        composite_equity={composite_equity}
        composite_dates={composite_dates}
        windows={windows}
      />,
    )
    const region = screen.getByRole('img')
    expect(region.getAttribute('aria-label')).toMatch(/2 windows/)
  })

  it('unmount で chart.remove() を呼ぶ', () => {
    const { unmount } = render(
      <WFOEquityTV
        composite_equity={composite_equity}
        composite_dates={composite_dates}
        windows={windows}
      />,
    )
    unmount()
    expect(removeMock).toHaveBeenCalledTimes(1)
  })
})
