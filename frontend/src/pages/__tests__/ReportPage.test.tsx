import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { getStrategyRuns: vi.fn(), getBacktest: vi.fn() },
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

// lightweight-charts は jsdom で rAF 例外を投げるため TV チャートをスタブ
vi.mock('../../charts/tv/EquityDrawdownPaneTV', () => ({
  EquityDrawdownPaneTV: () => <div data-testid="report-equity-tv" />,
}))

import { api } from '../../api/client'
import { ReportPage } from '../ReportPage'

const DETAIL = {
  run_id: 'run-1',
  strategy_id: 's1',
  period: { start: '2020-01', end: '2025-12' },
  equity: {
    dates: ['2020-01-02', '2020-01-03', '2020-01-06'],
    values: [100000, 101000, 102000],
  },
  drawdown: [0, -1, 0],
  daily_returns: [0.01, 0.0099],
  buy_hold_equity: [],
  benchmark_annual_returns: {},
  is_cutoff: { date: null, index: -1 },
  monthly_returns: {},
  trades: [
    { id: 1, holding_days: 3, return_pct: 2, direction: 'long', entry_date: '2020-01-02', exit_date: '2020-01-05', pnl: 10, mae_pct: -1, mfe_pct: 2 },
  ],
  metrics: {
    total_return_pct: 12.3,
    sharpe_ratio: 1.4,
    max_drawdown_pct: -8.2,
    win_rate_pct: 58,
    cagr_pct: 9.1,
    sortino_ratio: 1.8,
    calmar_ratio: 1.1,
    profit_factor: 1.7,
    total_trades: 42,
    annual_returns: { '2024': 10 },
  },
} as never

beforeEach(() => {
  vi.mocked(api.getStrategyRuns).mockReset().mockResolvedValue([
    { run_id: 'run-1', run_at: '2026-07-01', sharpe_ratio: 1.4, total_return_pct: 12.3, max_drawdown_pct: -8.2, source: null } as never,
  ])
  vi.mocked(api.getBacktest).mockReset().mockResolvedValue(DETAIL)
})

function renderReport(path = '/detail/s1/report') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/detail/:strategyId/report" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * issue #373: 全チャート + 全指標を 1 枚にまとめる一括レポートが無く、
 * run の記録・共有のたびにタブを回って個別保存が必要だった。
 * 印刷用ビュー（→ ブラウザの PDF 保存）を提供する。
 */
describe('ReportPage (issue #373)', () => {
  it('指標・エクイティ・年別サマリを 1 ページに描画する', async () => {
    renderReport()
    // runs → backtest の 2 段フェッチのため、遷移中の一時状態を踏まないよう
    // すべての検証を waitFor 内で行う
    await waitFor(() => {
      expect(screen.getByTestId('report-equity-tv')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 's1' })).toBeInTheDocument()
      expect(screen.getByText(/run-1/)).toBeInTheDocument()
      expect(screen.getAllByText(/Sharpe/i).length).toBeGreaterThan(0)
      expect(screen.getByRole('table', { name: /年別サマリ/ })).toBeInTheDocument()
    })
  })

  it('印刷ボタンが window.print を呼ぶ', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    try {
      renderReport()
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /印刷 \/ PDF 保存/ }))
      })
      expect(print).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('?run_id= で対象 run を指定できる', async () => {
    renderReport('/detail/s1/report?run_id=run-xyz')
    await waitFor(() => expect(api.getBacktest).toHaveBeenCalledWith('run-xyz'))
  })
})
