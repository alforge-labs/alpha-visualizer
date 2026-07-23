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
  it('shows the shared Loading skeleton while fetching (issue #266)', () => {
    vi.mocked(api.getLive).mockReturnValue(new Promise(() => {}))
    render(<LiveTab strategyId="sma_v1" runId="run_1" lang="ja" />)
    expect(screen.getByTestId('loading')).toBeInTheDocument()
  })

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

  /**
   * issue #264: トレード表のゼブラがグレー直書き rgba(127,127,127,0.04) で、
   * テーマトークンを迂回していた。surface-2 トークンへ置換して両テーマで成立させる。
   */
  it('uses var(--surface-2) for zebra rows instead of hardcoded gray rgba (issue #264)', async () => {
    const base = BASE_RESPONSE.live.trades[0]!
    const twoTrades: LiveDetailResponse = {
      ...BASE_RESPONSE,
      live: { ...BASE_RESPONSE.live, trades: [base, { ...base, trade_id: 't2' }] },
    }
    vi.mocked(api.getLive).mockResolvedValue(twoTrades)
    const { container } = render(<LiveTab strategyId="strat_a" runId="bt_run_1" lang="ja" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-summary-card').length).toBeGreaterThan(0)
    })

    const rows = container.querySelectorAll('table tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[1]!.getAttribute('style')).toContain('var(--surface-2)')
    expect(container.innerHTML).not.toContain('rgba(127,127,127')
  })
})

// position ベース combine portfolio（#221）。
// strategies.db 未登録の portfolio_id でも live_position_summaries 由来の
// summary を描画できることを保証する。
const POSITION_RESPONSE: LiveDetailResponse = {
  strategy_id: 'beat_qqq_hedged_v1',
  live: {
    summary: {
      strategy_id: 'beat_qqq_hedged_v1',
      portfolio_id: 'beat_qqq_hedged_v1',
      kind: 'position',
      metrics: {
        total_return_pct: 1.2,
        cagr_pct: 3.4,
        sharpe_ratio: 0.8,
        max_drawdown_pct: 2.1,
        volatility_pct: 11.0,
      },
      backtest_metrics: {
        total_return_pct: 881.63,
        cagr_pct: 15.03,
        sharpe_ratio: 1.02,
        max_drawdown_pct: 23.49,
        volatility_pct: 14.2,
      },
      equity: [
        ['2026-06-01T00:00:00', 100000],
        ['2026-06-02T00:00:00', 100500],
        ['2026-06-03T00:00:00', 101200],
      ],
      receipts_count: 4,
      sub_strategies: ['tqqq_sma200_atr_bho_phase2_v1_optimized', 'gld_bh_v1', 'tlt_bh_v1'],
      updated_at: '2026-06-06T10:50:22+00:00',
    },
    trades: [],
    period: null,
  },
  backtest: null,
  diff: null,
  warnings: ['position ベースの combine portfolio のため trade 単位の backtest diff はありません'],
}

describe('<LiveTab /> position kind (combine portfolio)', () => {
  it('renders position metrics cards instead of trade summary', async () => {
    vi.mocked(api.getLive).mockResolvedValue(POSITION_RESPONSE)
    render(<LiveTab strategyId="beat_qqq_hedged_v1" runId="" lang="ja" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-position-card').length).toBe(5)
    })
    // trade 単位のカード・トレード表は描画されないこと
    expect(screen.queryAllByTestId('live-summary-card')).toHaveLength(0)
    // 構成戦略とメタ情報
    expect(screen.getByText(/gld_bh_v1/)).toBeInTheDocument()
    expect(screen.getByText(/receipts: 4/)).toBeInTheDocument()
  })

  it('renders equity sparkline when equity series exists', async () => {
    vi.mocked(api.getLive).mockResolvedValue(POSITION_RESPONSE)
    render(<LiveTab strategyId="beat_qqq_hedged_v1" runId="" lang="ja" />)

    await waitFor(() => {
      expect(screen.getByTestId('live-position-equity')).toBeInTheDocument()
    })
  })

  it('inverts diff tone for max drawdown / volatility (lower is better)', async () => {
    vi.mocked(api.getLive).mockResolvedValue(POSITION_RESPONSE)
    render(<LiveTab strategyId="beat_qqq_hedged_v1" runId="" lang="ja" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-position-card').length).toBe(5)
    })
    const cards = screen.getAllByTestId('live-position-card')
    const findCard = (label: RegExp): HTMLElement => {
      const hit = cards.find((c) => label.test(c.textContent ?? ''))
      if (!hit) throw new Error(`card not found: ${label}`)
      return hit
    }
    // live DD 2.1 < BT DD 23.49 → diff 負だが「DD 縮小 = 良い」ので success
    const ddDiff = findCard(/最大DD/).querySelector<HTMLElement>('[data-testid="live-diff"]')
    expect(ddDiff?.style.color).toBe('var(--success)')
    // live CAGR 3.4 < BT 15.03 → diff 負で danger
    const cagrDiff = findCard(/CAGR/).querySelector<HTMLElement>('[data-testid="live-diff"]')
    expect(cagrDiff?.style.color).toBe('var(--danger)')
  })

  it('renders metrics without diff when backtest_metrics is null', async () => {
    const noBt: LiveDetailResponse = {
      ...POSITION_RESPONSE,
      live: {
        ...POSITION_RESPONSE.live,
        summary: {
          ...POSITION_RESPONSE.live.summary,
          backtest_metrics: null,
        },
      },
    }
    vi.mocked(api.getLive).mockResolvedValue(noBt)
    render(<LiveTab strategyId="beat_qqq_hedged_v1" runId="" lang="en" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('live-position-card').length).toBe(5)
    })
    const diffs = screen
      .getAllByTestId('live-position-card')
      .flatMap((c) => Array.from(c.querySelectorAll('[data-testid="live-diff"]')))
    expect(diffs.every((d) => (d.textContent ?? '').includes('—'))).toBe(true)
  })
})
