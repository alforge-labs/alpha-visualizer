import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { StrategyComparison } from '../../../api/types'
import { CompareTable } from '../CompareTable'

/**
 * issue #367: 差分行の ↑↓ が「増減」なのか「良し悪し」なのか読み取れなかった
 * （例: Max DD の「+12.52% ↓」）。▲=改善 / ▼=悪化 に統一し凡例を常設する。
 */
const STRATS = [
  {
    id: 'base', name: 'Base', symbol: 'SPY', is_baseline: true,
    total_return_pct: 10, cagr_pct: 5, sharpe_ratio: 1.0, sortino_ratio: 1.2,
    max_drawdown_pct: -10, win_rate_pct: 50, profit_factor: 1.2, total_trades: 40,
  },
  {
    id: 'better', name: 'Better', symbol: 'SPY', is_baseline: false,
    total_return_pct: 20, cagr_pct: 8, sharpe_ratio: 1.5, sortino_ratio: 1.8,
    max_drawdown_pct: -5, win_rate_pct: 55, profit_factor: 1.6, total_trades: 42,
  },
] as unknown as StrategyComparison[]

describe('CompareTable delta markers (issue #367)', () => {
  it('改善は ▲・凡例を常設し、旧 ↑↓ を使わない', () => {
    render(<CompareTable strategies={STRATS} lang="ja" />)
    // 改善デルタ（Sharpe +0.50）に ▲ が付く
    expect(screen.getByText(/\+0\.50 ▲/)).toBeInTheDocument()
    // 凡例
    expect(screen.getByText(/▲ = ベースより改善/)).toBeInTheDocument()
    expect(screen.getByText(/▼ = ベースより悪化/)).toBeInTheDocument()
    // 旧表記が残っていない
    expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument()
  })

  it('Max DD の改善（絶対値減少）も ▲ になる', () => {
    render(<CompareTable strategies={STRATS} lang="ja" />)
    // Max DD: -5 - (-10) = +5 → DD は hb:false（小さいほど良い）なので改善 ▲
    expect(screen.getByText(/\+5% ▲/)).toBeInTheDocument()
  })
})
