import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LiveDetailResponse } from '../../../api/types'
import { LiveTab } from '../LiveTab'

vi.mock('../../../api/client', () => ({
  api: {
    getLive: vi.fn(),
  },
  // 実装の `import { ApiError } from '../../api/client'` を解決するため
  // 最低限のクラスをここで再エクスポートする。
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

import { api, ApiError } from '../../../api/client'

const BASE_RESPONSE: LiveDetailResponse = {
  strategy_id: 'strat_a',
  live: {
    summary: {
      strategy_id: 'strat_a',
      total_trades: 5,
      win_rate_pct: 60,
      profit_factor: 1.8,
      max_drawdown_pct: -3,
      net_pnl: 1200,
      symbols: ['AAPL'],
    },
    trades: [
      {
        trade_id: 't1',
        symbol: 'AAPL',
        side: 'long',
        entry_at: '2026-04-01T09:00:00',
        exit_at: '2026-04-02T15:00:00',
        qty: 100,
        entry_price: 100,
        exit_price: 105,
        net_pnl: 500,
        return_pct: 5,
        exit_reason: 'tp',
      },
    ],
    period: { start: '2026-04-01T09:00:00', end: '2026-04-02T15:00:00' },
  },
  backtest: {
    run_id: 'bt_run_1',
    period: { start: '2026-04-01T09:00:00', end: '2026-04-02T15:00:00' },
    aligned: {
      total_trades: 4,
      win_rate_pct: 50,
      profit_factor: 1.4,
      max_drawdown_pct: -5,
      net_pnl: 800,
    },
  },
  diff: {
    total_trades: 1,
    win_rate_pct: 10,
    profit_factor: 0.4,
    max_drawdown_pct: 2,
    net_pnl: 400,
  },
  warnings: [],
}

beforeEach(() => {
  vi.mocked(api.getLive).mockReset()
})

describe('<LiveTab />', () => {
  it('shows summary cards with positive diff when live outperforms backtest', async () => {
    vi.mocked(api.getLive).mockResolvedValue(BASE_RESPONSE)
    render(<LiveTab strategyId="strat_a" runId="bt_run_1" lang="ja" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-summary-card').length).toBeGreaterThan(0)
    })

    const diffs = screen.getAllByTestId('live-diff')
    const text = diffs.map((d) => d.textContent ?? '').join('|')
    expect(text).toMatch(/\+1\.000/) // total_trades diff = +1
    expect(text).toMatch(/\+10\.00%/) // win_rate diff = +10%

    // 全 diff が正のため var(--success) が含まれること
    const goodColors = diffs.map((d) => (d as HTMLElement).style.color)
    expect(goodColors.some((c) => c === 'var(--success)')).toBe(true)
  })

  it('renders danger color for negative diff', async () => {
    const negativeResponse: LiveDetailResponse = {
      ...BASE_RESPONSE,
      diff: {
        total_trades: -2,
        win_rate_pct: -5,
        profit_factor: -0.2,
        max_drawdown_pct: -1,
        net_pnl: -300,
      },
    }
    vi.mocked(api.getLive).mockResolvedValue(negativeResponse)
    render(<LiveTab strategyId="strat_a" runId="bt_run_1" lang="ja" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-diff').length).toBeGreaterThan(0)
    })

    const diffs = screen.getAllByTestId('live-diff')
    const colors = diffs.map((d) => (d as HTMLElement).style.color)
    expect(colors.every((c) => c === 'var(--danger)')).toBe(true)
  })

  it('handles missing backtest gracefully (diff = null)', async () => {
    const noBacktest: LiveDetailResponse = {
      ...BASE_RESPONSE,
      backtest: null,
      diff: null,
      warnings: ['対応する backtest run が見つかりません'],
    }
    vi.mocked(api.getLive).mockResolvedValue(noBacktest)
    render(<LiveTab strategyId="strat_a" runId="bt_run_1" lang="en" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-diff').length).toBeGreaterThan(0)
    })

    const diffs = screen.getAllByTestId('live-diff')
    expect(diffs.every((d) => (d.textContent ?? '').includes('—'))).toBe(true)
    expect(screen.getByText(/No BT match/)).toBeInTheDocument()
  })

  it('shows error state when API rejects', async () => {
    vi.mocked(api.getLive).mockRejectedValue(new Error('Network down'))
    render(<LiveTab strategyId="strat_a" runId="bt_run_1" lang="ja" />)

    await waitFor(() => {
      expect(screen.getByText(/取得に失敗/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Network down/)).toBeInTheDocument()
  })

  it('shows no-data note when API returns 404', async () => {
    vi.mocked(api.getLive).mockRejectedValue(new ApiError('not found', 404, '/api/live/strat_a'))
    render(<LiveTab strategyId="strat_a" runId="bt_run_1" lang="ja" />)

    await waitFor(() => {
      expect(screen.getByText(/ライブ実績データがありません/)).toBeInTheDocument()
    })
    // 生のエラーメッセージ "API 404" が表示されないこと
    expect(screen.queryByText(/取得に失敗/)).toBeNull()
  })
})
