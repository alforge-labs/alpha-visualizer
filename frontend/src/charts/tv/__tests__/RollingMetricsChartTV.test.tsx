import { render as rtlRender, screen, type RenderOptions } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardProvider } from '../../../contexts/DashboardContext'

function render(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, { wrapper: DashboardProvider, ...options })
}

const mocks = vi.hoisted(() => {
  const setDataMock = vi.fn()
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
  return {
    setDataMock,
    applyOptionsMock,
    setVisibleRangeMock,
    removeMock,
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

import { RollingMetricsChartTV } from '../RollingMetricsChartTV'

const { setDataMock, setVisibleRangeMock, removeMock, addSeriesMock, createChartMock } = mocks

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  setVisibleRangeMock.mockClear()
  removeMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleReturns = Array.from({ length: 120 }, (_, i) => Math.sin(i / 10) * 0.01)
const sampleDates = Array.from(
  { length: 120 },
  (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
)

describe('RollingMetricsChartTV', () => {
  it('マウント時に createChart + 1 LineSeries を生成する', () => {
    render(<RollingMetricsChartTV dailyReturns={sampleReturns} dates={sampleDates} />)
    expect(createChartMock).toHaveBeenCalledTimes(1)
    expect(addSeriesMock).toHaveBeenCalledWith('LineSeriesDef', expect.any(Object))
    expect(addSeriesMock).toHaveBeenCalledTimes(1)
  })

  it('rolling Sharpe のデータを setData で渡し、viewport を反映する', () => {
    render(<RollingMetricsChartTV dailyReturns={sampleReturns} dates={sampleDates} />)
    expect(setDataMock).toHaveBeenCalled()
    expect(setVisibleRangeMock).toHaveBeenCalled()
  })

  it('Window 切替ボタン (30d / 60d / 90d) を描画する', () => {
    render(<RollingMetricsChartTV dailyReturns={sampleReturns} dates={sampleDates} />)
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '60d' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '90d' })).toBeInTheDocument()
  })

  it('aria-label に window 幅と point 数が含まれる', () => {
    render(<RollingMetricsChartTV dailyReturns={sampleReturns} dates={sampleDates} />)
    const region = screen.getByRole('group', { name: /Rolling Sharpe/ })
    expect(region.getAttribute('aria-label')).toMatch(/Rolling Sharpe \(60-day window\)/)
  })

  it('unmount で chart.remove() を呼ぶ', () => {
    const { unmount } = render(
      <RollingMetricsChartTV dailyReturns={sampleReturns} dates={sampleDates} />,
    )
    unmount()
    expect(removeMock).toHaveBeenCalledTimes(1)
  })
})
