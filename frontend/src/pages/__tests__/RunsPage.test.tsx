import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { listResults: vi.fn() },
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

import { api } from '../../api/client'
import { RunsPage } from '../RunsPage'

const RUNS = [
  {
    run_id: 'run-a',
    strategy_id: 'sma_v1',
    symbol: 'SPY',
    run_at: '2026-07-01T10:00:00',
    sharpe_ratio: 1.8,
    total_return_pct: 20,
    max_drawdown_pct: -8,
    total_trades: 40,
  },
  {
    run_id: 'run-b',
    strategy_id: 'rsi_v1',
    symbol: 'QQQ',
    run_at: '2026-06-01T10:00:00',
    sharpe_ratio: 0.4,
    total_return_pct: -3,
    max_drawdown_pct: -15,
    total_trades: 25,
  },
]

beforeEach(() => {
  vi.mocked(api.listResults).mockReset().mockResolvedValue(RUNS as never)
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/runs']}>
      <RunsPage />
    </MemoryRouter>,
  )
}

/**
 * issue #374: run は第一級の資産なのに戦略経由でしか辿れず、
 * 「Sharpe 1.5 超の run」「特定銘柄の全 run」を横断検索できなかった。
 * 全 run 横断の Runs ページ（フィルタ・ソート・Detail への導線）を追加する。
 */
describe('RunsPage (issue #374)', () => {
  it('全 run を一覧表示し、行から該当 run の Detail へ遷移できる', async () => {
    renderPage()
    expect(await screen.findByText('sma_v1')).toBeInTheDocument()
    expect(screen.getByText('rsi_v1')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /sma_v1/ })
    expect(link.getAttribute('href')).toBe('/detail/sma_v1?run_id=run-a')
  })

  it('Sharpe 下限で絞り込める', async () => {
    renderPage()
    await screen.findByText('sma_v1')
    fireEvent.change(screen.getByLabelText(/Sharpe 下限/), { target: { value: '1.5' } })
    expect(screen.queryByText('rsi_v1')).not.toBeInTheDocument()
    expect(screen.getByText('sma_v1')).toBeInTheDocument()
  })

  it('銘柄で絞り込める', async () => {
    renderPage()
    await screen.findByText('sma_v1')
    fireEvent.change(screen.getByLabelText(/銘柄/), { target: { value: 'QQQ' } })
    expect(screen.queryByText('sma_v1')).not.toBeInTheDocument()
    expect(screen.getByText('rsi_v1')).toBeInTheDocument()
  })

  it('検索（strategy_id）で絞り込め、絞り込み件数が見える', async () => {
    renderPage()
    await screen.findByText('sma_v1')
    fireEvent.change(screen.getByLabelText(/検索/), { target: { value: 'rsi' } })
    expect(screen.queryByText('sma_v1')).not.toBeInTheDocument()
    expect(screen.getByText(/1 \/ 2 件/)).toBeInTheDocument()
  })

  it('取得失敗時は ErrorBanner + 再試行を表示する', async () => {
    vi.mocked(api.listResults).mockRejectedValueOnce(new Error('Failed to fetch'))
    renderPage()
    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('サーバーに接続できません')
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })
})
