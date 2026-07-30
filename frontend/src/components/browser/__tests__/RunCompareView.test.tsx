import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BacktestDetail } from '../../../api/types'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため TV チャートを stub
vi.mock('../../../charts/tv/CompareEquityTV', () => ({
  CompareEquityTV: () => <div data-testid="compare-equity-stub" />,
}))
vi.mock('../../../api/client', () => ({
  api: { getBacktest: vi.fn() },
  // useFetchByKey が instanceof ApiError で分岐するため mock にも実クラスが必要
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

import { api } from '../../../api/client'
import { RunCompareView } from '../RunCompareView'

/**
 * issue #369: チューニングループでパラメータを変えて再実行できるのに、
 * 変更前後の run を並べて「どの指標がどれだけ動いたか」を見る手段がなく、
 * Run History の 3 指標を目視で往復するしかなかった。
 * 2 run の metrics 差分テーブル + equity 重ね描きを保証する。
 */

function buildDetail(overrides: Partial<BacktestDetail>): BacktestDetail {
  return {
    run_id: 'run-x',
    strategy_id: 's1',
    strategy_name: 'S1',
    symbol: 'AAPL',
    timeframe: '1d',
    run_at: '2026-01-01T00:00:00',
    period: { start: '2025-01', end: '2026-01' },
    equity: { dates: ['2025-01-01', '2025-01-02'], values: [100, 110] },
    drawdown: [0, 0],
    is_cutoff: { date: null, index: -1 },
    metrics: {
      sharpe_ratio: 1.2,
      total_return_pct: 10.0,
      cagr_pct: 8.0,
      max_drawdown_pct: 12.0,
      win_rate_pct: 50.0,
      profit_factor: 1.4,
      total_trades: 40,
      sortino_ratio: 1.5,
      calmar_ratio: 0.8,
      annual_returns: {},
    },
    is_metrics: null,
    oos_metrics: null,
    monthly_returns: {},
    trades: [],
    daily_returns: [],
    buy_hold_equity: [],
    benchmark_annual_returns: {},
    ...overrides,
  } as BacktestDetail
}

const detailA = buildDetail({ run_id: 'run-a', run_at: '2026-01-01T00:00:00' })
const detailB = buildDetail({
  run_id: 'run-b',
  run_at: '2026-02-01T00:00:00',
  metrics: {
    sharpe_ratio: 1.5,
    total_return_pct: 14.0,
    cagr_pct: 9.5,
    max_drawdown_pct: 9.0,
    win_rate_pct: 55.0,
    profit_factor: 1.7,
    total_trades: 38,
    sortino_ratio: 1.9,
    calmar_ratio: 1.1,
    annual_returns: {},
  } as BacktestDetail['metrics'],
})

beforeEach(() => {
  vi.mocked(api.getBacktest).mockReset()
  vi.mocked(api.getBacktest).mockImplementation((id: string) =>
    Promise.resolve(id === 'run-a' ? detailA : detailB),
  )
})

describe('RunCompareView (issue #369)', () => {
  it('2 run の指標差分テーブルと equity 重ね描きを表示する', async () => {
    render(
      <RunCompareView runIdA="run-a" runIdB="run-b" lang="ja" onClear={() => {}} />,
    )
    expect(await screen.findByTestId('run-compare-table')).toBeInTheDocument()
    // /api/results/{run_id} を 2 回取得（フロントのみで実装・issue の改善案通り）
    expect(api.getBacktest).toHaveBeenCalledWith('run-a')
    expect(api.getBacktest).toHaveBeenCalledWith('run-b')
    // Δ = B − A: Sharpe 1.50 − 1.20 = +0.30
    expect(screen.getByTestId('delta-sharpe_ratio')).toHaveTextContent('+0.30')
    // equity 重ね描きは CompareEquityTV へ委譲
    expect(screen.getByTestId('compare-equity-stub')).toBeInTheDocument()
  })

  it('Max DD は絶対値の減少を改善として扱う（Δ にも改善色を示す）', async () => {
    render(
      <RunCompareView runIdA="run-a" runIdB="run-b" lang="ja" onClear={() => {}} />,
    )
    await screen.findByTestId('run-compare-table')
    // DD 12.0% → 9.0% は改善。Δ セルは success トーンで表示される
    const ddDelta = screen.getByTestId('delta-max_drawdown_pct')
    expect(ddDelta.getAttribute('style')).toContain('var(--success)')
    // Sharpe 改善も success
    const shDelta = screen.getByTestId('delta-sharpe_ratio')
    expect(shDelta.getAttribute('style')).toContain('var(--success)')
  })

  it('取得失敗時はエラーを表示する（無限スケルトンにしない）', async () => {
    vi.mocked(api.getBacktest).mockRejectedValue(new Error('boom'))
    render(
      <RunCompareView runIdA="run-a" runIdB="run-b" lang="ja" onClear={() => {}} />,
    )
    expect(
      await screen.findByText(/比較データの取得に失敗しました/),
    ).toBeInTheDocument()
  })
})
