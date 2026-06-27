import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const setDataMock = vi.fn()
  const applyOptionsMock = vi.fn()
  const setVisibleRangeMock = vi.fn()
  const removeMock = vi.fn()
  const removeSeriesMock = vi.fn()
  const addSeriesMock = vi.fn(() => ({
    setData: setDataMock,
    applyOptions: applyOptionsMock,
  }))
  const createChartMock = vi.fn(() => ({
    remove: removeMock,
    addSeries: addSeriesMock,
    removeSeries: removeSeriesMock,
    applyOptions: applyOptionsMock,
    timeScale: () => ({ setVisibleRange: setVisibleRangeMock }),
  }))
  return {
    setDataMock,
    applyOptionsMock,
    setVisibleRangeMock,
    removeMock,
    removeSeriesMock,
    addSeriesMock,
    createChartMock,
  }
})

vi.mock('lightweight-charts', () => ({
  LineSeries: 'LineSeriesDef',
  ColorType: { Solid: 'solid' },
  LineStyle: { Dotted: 0, Dashed: 1, Solid: 2 },
  createChart: mocks.createChartMock,
}))

import { CompareEquityTV } from '../CompareEquityTV'
import type { CompareEquityTVSeries } from '../CompareEquityTV'

const { setDataMock, removeMock, removeSeriesMock, addSeriesMock, createChartMock } = mocks

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  removeMock.mockClear()
  removeSeriesMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

const dates = Array.from(
  { length: 30 },
  (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
)
const makeSeries = (id: string, base: number, isBaseline = false): CompareEquityTVSeries => ({
  id,
  label: `Strategy ${id}`,
  values: Array.from({ length: 30 }, (_, i) => base + i),
  dates,
  color: '#c25a2a',
  isBaseline,
})

describe('CompareEquityTV', () => {
  it('series 件数ぶん LineSeries を生成する', () => {
    const series = [makeSeries('a', 100, true), makeSeries('b', 90), makeSeries('c', 95)]
    render(<CompareEquityTV series={series} />)
    expect(addSeriesMock).toHaveBeenCalledTimes(3)
  })

  it('凡例にすべての series ラベルが表示される', () => {
    const series = [makeSeries('a', 100, true), makeSeries('b', 90)]
    render(<CompareEquityTV series={series} />)
    expect(screen.getByText('Strategy a')).toBeInTheDocument()
    expect(screen.getByText('Strategy b')).toBeInTheDocument()
    expect(screen.getByText('Base')).toBeInTheDocument()
  })

  it('series を 1 件減らすと removeSeries が呼ばれる', () => {
    const series = [makeSeries('a', 100), makeSeries('b', 90)]
    const { rerender } = render(<CompareEquityTV series={series} />)
    expect(addSeriesMock).toHaveBeenCalledTimes(2)
    removeSeriesMock.mockClear()
    rerender(<CompareEquityTV series={[makeSeries('a', 100)]} />)
    expect(removeSeriesMock).toHaveBeenCalledTimes(1)
  })

  it('aria-label に series 件数が入る', () => {
    const series = [makeSeries('a', 100), makeSeries('b', 90), makeSeries('c', 95)]
    render(<CompareEquityTV series={series} />)
    const region = screen.getByRole('group')
    expect(region.getAttribute('aria-label')).toMatch(/3 strategies/)
  })

  it('unmount で chart.remove() を呼ぶ', () => {
    const { unmount } = render(<CompareEquityTV series={[makeSeries('a', 100)]} />)
    unmount()
    expect(removeMock).toHaveBeenCalledTimes(1)
  })
})
