import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BacktestDetail, StrategyListItem, StrategyRun } from '../../../api/types'
import { StrategySlidePanel } from '../StrategySlidePanel'

vi.mock('../../../api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../api/client')>()
  return {
    ...mod,
    api: {
      ...mod.api,
      getStrategyRuns: vi.fn(),
      getBacktest: vi.fn(),
    },
  }
})

import { api } from '../../../api/client'

const RUN = {
  run_id: 'run-1',
  run_at: '2026-07-01T00:00:00',
  sharpe_ratio: 1.23,
  total_return_pct: 10,
  max_drawdown_pct: -5,
  source: null,
} as unknown as StrategyRun

const DETAIL = { equity: { values: [1, 2, 3] } } as unknown as BacktestDetail

const ITEM: StrategyListItem = {
  strategy_id: 'spy_test_v1',
  name: 'SPY Test',
  symbol: 'SPY',
  timeframe: '1d',
  tags: [],
  target_symbols: [],
  latest_sharpe: null,
  latest_return_pct: null,
  latest_max_drawdown_pct: null,
  latest_profit_factor: null,
  latest_win_rate_pct: null,
  latest_total_trades: null,
  last_run_at: null,
  latest_source: null,
}

beforeEach(() => {
  vi.mocked(api.getStrategyRuns).mockReset().mockResolvedValue([RUN])
  vi.mocked(api.getBacktest).mockReset().mockResolvedValue(DETAIL)
})

describe('StrategySlidePanel', () => {
  it('実行履歴と sparkline を表示する', async () => {
    render(
      <MemoryRouter>
        <StrategySlidePanel strategy={ITEM} onClose={() => {}} lang="ja" />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Sharpe 1.23')).toBeInTheDocument())
  })

  /**
   * 回帰テスト: パネルを開いている間、sparkline の prefetch が毎レンダー再発火して
   * `/api/strategies/{id}` と `/api/results/{run_id}` を無限に叩き続ける不具合があった。
   * 開いたままの状態で呼び出し回数が増え続けないことを保証する。
   */
  it('開いたままでも API 呼び出しがループしない', async () => {
    render(
      <MemoryRouter>
        <StrategySlidePanel strategy={ITEM} onClose={() => {}} lang="ja" />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Sharpe 1.23')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 実行履歴（useStrategyRuns）で 1 回、sparkline の prefetch で 1 回の計 2 回が上限
    expect(api.getStrategyRuns).toHaveBeenCalledTimes(2)
    expect(api.getBacktest).toHaveBeenCalledTimes(1)
  })
})


/**
 * issue #356: 再実行の確認ダイアログが「最新結果が上書きされます」(danger) と
 * 警告していたが、実際は POST /api/run は新しい run を追加するだけで過去の
 * 結果は実行履歴から閲覧し続けられる。事実と異なる警告はデータ消失の誤解や
 * 再実行のためらいを生むため、実挙動の説明に置き換える。
 */
describe('StrategySlidePanel 再実行ダイアログ (issue #356)', () => {
  it('「追加される」事実を説明し、事実と異なる上書き警告を出さない', async () => {
    const withHistory = { ...ITEM, last_run_at: '2026-07-01T00:00:00' }
    render(
      <MemoryRouter>
        <StrategySlidePanel strategy={withHistory} onClose={() => {}} lang="ja" />
      </MemoryRouter>,
    )
    const btn = await screen.findByRole('button', { name: /バックテスト再実行/ })
    fireEvent.click(btn)
    expect(screen.queryByText(/上書きされます/)).not.toBeInTheDocument()
    expect(screen.getByText(/過去の結果は実行履歴に残ります/)).toBeInTheDocument()
  })
})
