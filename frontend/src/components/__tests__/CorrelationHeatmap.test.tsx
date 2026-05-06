import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CorrelationHeatmap } from '../charts/CorrelationHeatmap'
import type { StrategyComparison } from '../../api/types'

function strategy(
  partial: Partial<StrategyComparison> & Pick<StrategyComparison, 'id' | 'name'>,
): StrategyComparison {
  return {
    symbol: 'SPY',
    total_return_pct: 0,
    cagr_pct: 0,
    sharpe_ratio: 0,
    sortino_ratio: 0,
    max_drawdown_pct: 0,
    win_rate_pct: 0,
    profit_factor: 0,
    total_trades: 0,
    is_baseline: false,
    daily_returns: [0.01, -0.02, 0.03, 0.0, -0.01],
    ...partial,
  }
}

describe('<CorrelationHeatmap />', () => {
  it('returns null when fewer than 2 strategies have daily_returns', () => {
    const { container } = render(
      <CorrelationHeatmap
        strategies={[strategy({ id: 'a', name: 'A' })]}
        lang="ja"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when daily_returns are missing on all-but-one strategy', () => {
    const { container } = render(
      <CorrelationHeatmap
        strategies={[
          strategy({ id: 'a', name: 'A' }),
          strategy({ id: 'b', name: 'B', daily_returns: undefined }),
        ]}
        lang="ja"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the heatmap card when 2+ eligible strategies are provided', () => {
    render(
      <CorrelationHeatmap
        strategies={[
          strategy({ id: 'a', name: 'Alpha' }),
          strategy({ id: 'b', name: 'Beta', daily_returns: [0.02, -0.01, 0.04, -0.01, 0.02] }),
        ]}
        lang="ja"
      />,
    )
    expect(screen.getByTestId('correlation-heatmap-card')).toBeInTheDocument()
  })

  it('shows the mixed-symbols warning when strategies span different symbols', () => {
    render(
      <CorrelationHeatmap
        strategies={[
          strategy({ id: 'a', name: 'Alpha', symbol: 'SPY' }),
          strategy({ id: 'b', name: 'Beta', symbol: 'QQQ' }),
        ]}
        lang="ja"
      />,
    )
    expect(screen.getByTestId('mixed-symbols-warning')).toBeInTheDocument()
  })

  it('hides the mixed-symbols warning when all strategies share a symbol', () => {
    render(
      <CorrelationHeatmap
        strategies={[
          strategy({ id: 'a', name: 'Alpha', symbol: 'SPY' }),
          strategy({ id: 'b', name: 'Beta', symbol: 'SPY' }),
        ]}
        lang="ja"
      />,
    )
    expect(screen.queryByTestId('mixed-symbols-warning')).toBeNull()
  })
})
