import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// TV チャートをスタブする（このテストの関心は 404 empty state のみ）
vi.mock('../../charts/tv/EquityDrawdownPaneTV', () => ({
  EquityDrawdownPaneTV: () => <div data-testid="equity-pane-stub" />,
}))
vi.mock('../../charts/tv/RollingMetricsChartTV', () => ({
  RollingMetricsChartTV: () => <div data-testid="rolling-metrics-chart-tv" />,
}))

vi.mock('../../api/client', () => ({
  api: {
    getStrategyRuns: vi.fn(),
    getBacktest: vi.fn(),
    getWFO: vi.fn(),
    getOptimize: vi.fn(),
    getStrategyDetail: vi.fn(),
    runBacktest: vi.fn(),
    listLive: vi.fn().mockResolvedValue([]),
  },
  ApiError: class ApiError extends Error {
    status: number
    url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  },
}))

import { api, ApiError } from '../../api/client'
import { DetailPage } from '../DetailPage'

function renderDetail(strategyId: string) {
  return render(
    <MemoryRouter initialEntries={[`/detail/${strategyId}`]}>
      <Routes>
        <Route path="/detail/:strategyId" element={<DetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.getStrategyRuns).mockReset()
  vi.mocked(api.getWFO).mockRejectedValue(
    new ApiError('not found', 404, '/api/wfo/x'),
  )
  vi.mocked(api.getOptimize).mockRejectedValue(
    new ApiError('not found', 404, '/api/optimize/x'),
  )
})

/**
 * issue #347: 存在しない戦略 ID の /detail/<id> が 404 表示にならず、
 * ローディングスケルトンが永久に表示され続けていた。
 * ブックマーク切れ・削除済み戦略の共有 URL・typo で誰でも踏む経路のため、
 * 「戦略が見つかりません」の empty state と一覧へ戻る導線を保証する。
 */
describe('DetailPage strategy not found (issue #347)', () => {
  it('shows a 404 empty state instead of an eternal skeleton', async () => {
    vi.mocked(api.getStrategyRuns).mockRejectedValue(
      new ApiError('not found', 404, '/api/strategies/nonexistent'),
    )
    renderDetail('nonexistent')

    await waitFor(() =>
      expect(screen.getByTestId('strategy-not-found')).toBeInTheDocument(),
    )
    expect(screen.getByText('戦略が見つかりません')).toBeInTheDocument()
    // 回復導線（一覧へ戻る）があること
    expect(
      screen.getByRole('button', { name: '戦略一覧へ戻る' }),
    ).toBeInTheDocument()
  })

  it('does not show the 404 state for an existing strategy with zero runs', async () => {
    // 戦略は存在するが run が無い（= /strategies/{id} は 200 で results 空）
    vi.mocked(api.getStrategyRuns).mockResolvedValue([])
    renderDetail('existing_no_runs')

    await waitFor(() =>
      expect(api.getStrategyRuns).toHaveBeenCalled(),
    )
    expect(screen.queryByTestId('strategy-not-found')).not.toBeInTheDocument()
  })
})
