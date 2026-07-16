import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyComparison } from '../../api/types'
import { CompareScreen } from '../CompareScreen'

vi.mock('../../lib/shareCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shareCard')>()
  return { ...actual, downloadCompareShareCard: vi.fn() }
})

import { downloadCompareShareCard } from '../../lib/shareCard'

const STRATS = [
  {
    id: 'sma_v1',
    name: 'SMA v1',
    symbol: 'SPY',
    total_return_pct: 12.3,
    cagr_pct: 5.1,
    sharpe_ratio: 1.4,
    sortino_ratio: 1.9,
    max_drawdown_pct: -8.2,
    win_rate_pct: 55,
    profit_factor: 1.6,
    total_trades: 40,
    is_baseline: true,
    equity: { dates: ['2020-01-02', '2020-01-03'], values: [100, 110] },
    daily_returns: [0.1, -0.05],
  },
  {
    id: 'rsi_v1',
    name: 'RSI v1',
    symbol: 'SPY',
    total_return_pct: -4.2,
    cagr_pct: -1.1,
    sharpe_ratio: 0.4,
    sortino_ratio: 0.5,
    max_drawdown_pct: -12.9,
    win_rate_pct: 44,
    profit_factor: 0.9,
    total_trades: 31,
    is_baseline: false,
    equity: { dates: ['2020-01-02', '2020-01-03'], values: [100, 96] },
    daily_returns: [-0.02, 0.01],
  },
] as unknown as StrategyComparison[]

/**
 * Compare 画面のシェアカード導線（Wave 4）: 複数戦略の比較結果を
 * 1枚のカードとしてシェアでき、カードが AlphaForge の認知経路になる。
 */
describe('<CompareScreen /> share card', () => {
  it('renders a share button and triggers the compare share card download', async () => {
    render(<CompareScreen data={STRATS} lang="ja" symbol="SPY" />)
    const btn = screen.getByRole('button', { name: /シェアカード/ })
    await userEvent.click(btn)
    expect(downloadCompareShareCard).toHaveBeenCalledTimes(1)
    const call = vi.mocked(downloadCompareShareCard).mock.calls[0]
    expect(call?.[0]).toBe(STRATS)
    expect(call?.[1]).toBe('SPY')
    expect(call?.[2]).toBe('ja')
  })
})
