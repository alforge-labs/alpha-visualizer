import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const addSeriesMock = vi.fn(() => ({
    setData: vi.fn(),
    applyOptions: vi.fn(),
  }))
  const createChartMock = vi.fn(() => ({
    remove: vi.fn(),
    addSeries: addSeriesMock,
    applyOptions: vi.fn(),
    timeScale: () => ({
      setVisibleRange: vi.fn(),
      getVisibleRange: vi.fn(() => null),
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    }),
  }))
  return { addSeriesMock, createChartMock }
})

vi.mock('lightweight-charts', () => ({
  LineSeries: 'LineSeriesDef',
  ColorType: { Solid: 'solid' },
  LineStyle: { Dotted: 0, Dashed: 1, Solid: 2 },
  createChart: mocks.createChartMock,
}))

import { RollingMetricsChartTV } from '../RollingMetricsChartTV'
import { DashboardProvider } from '../../../contexts/DashboardContext'

beforeEach(() => {
  mocks.createChartMock.mockClear()
})

/**
 * issue #376: rolling 指標が Sharpe のみだった。系列切替（Sharpe / Vol）を
 * 追加し、ボラティリティレジームの変化を確認できるようにする。
 */
const RETURNS = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.008))
const DATES = Array.from({ length: 121 }, (_, i) => {
  const d = new Date(2024, 0, 1 + i)
  return d.toISOString().slice(0, 10)
})

function renderChart() {
  return render(
    <DashboardProvider>
      <RollingMetricsChartTV dailyReturns={RETURNS} dates={DATES} lang="ja" />
    </DashboardProvider>,
  )
}

describe('RollingMetricsChartTV metric toggle (issue #376)', () => {
  it('既定は Sharpe、トグルで年率ボラティリティに切り替わる', () => {
    renderChart()
    expect(screen.getByRole('group', { name: /Rolling Sharpe/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ボラティリティ/ }))
    expect(screen.getByRole('group', { name: /Rolling Volatility/ })).toBeInTheDocument()
    // データ表の列名も切り替わる
    expect(screen.getByText('Rolling Volatility (%)')).toBeInTheDocument()
  })

  it('Sharpe ボタンで元に戻せる', () => {
    renderChart()
    fireEvent.click(screen.getByRole('button', { name: /ボラティリティ/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sharpe' }))
    expect(screen.getByRole('group', { name: /Rolling Sharpe/ })).toBeInTheDocument()
  })
})
