import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { MetricsGrid } from '../metrics/MetricsGrid'
import { MetricsSummaryBarV2 } from '../MetricsSummaryBarV2'
import { StrategyTable } from '../browser/StrategyTable'
import { StrategySlidePanel } from '../browser/StrategySlidePanel'
import type { BacktestMetrics, StrategyListItem } from '../../api/types'

// issue #54: tokens.css の CSS 変数を `gridTemplateColumns` 等に注入することで
// @media による上書きを可能にしている。インラインスタイル文字列が想定通り
// `var(--cols-*)` を含むことを検証する。

const MOCK_METRICS: BacktestMetrics = {
  total_return_pct: 12.34,
  sharpe_ratio: 1.5,
  max_drawdown_pct: -10,
  win_rate_pct: 55,
  cagr_pct: 9.8,
  sortino_ratio: 1.8,
  calmar_ratio: 0.8,
  profit_factor: 1.6,
  total_trades: 42,
  avg_holding_days: 5,
  omega_ratio: 1.2,
  tail_ratio: 1.1,
  var_95_pct: -1.5,
  cvar_95_pct: -2.1,
  exposure_pct: 80,
  positive_month_ratio: 60,
  max_consecutive_wins: 4,
  max_consecutive_losses: 2,
  avg_win_pct: 2,
  avg_loss_pct: -1,
  max_drawdown_duration_days: 30,
  recovery_days: 15,
  annual_returns: {},
}

describe('Responsive styles (issue #54)', () => {
  it('MetricsGrid uses --cols-kpi CSS variable for KPI grid', () => {
    const { getByTestId } = render(<MetricsGrid metrics={MOCK_METRICS} compact={false} lang="ja" />)
    const grid = getByTestId('kpi-grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('var(--cols-kpi')
  })

  it('MetricsGrid uses --cols-kpi-secondary CSS variable for secondary grid', () => {
    const { getByTestId } = render(<MetricsGrid metrics={MOCK_METRICS} compact={false} lang="ja" />)
    const grid = getByTestId('secondary-grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('var(--cols-kpi-secondary')
  })

  it('MetricsGrid hides secondary grid when compact', () => {
    const { queryByTestId } = render(<MetricsGrid metrics={MOCK_METRICS} compact={true} lang="ja" />)
    expect(queryByTestId('secondary-grid')).toBeNull()
  })

  it('MetricsSummaryBarV2 uses --cols-summary-bar CSS variable', () => {
    const { getByTestId } = render(<MetricsSummaryBarV2 metrics={MOCK_METRICS} lang="ja" />)
    const bar = getByTestId('metrics-summary-bar') as HTMLElement
    expect(bar.style.gridTemplateColumns).toContain('var(--cols-summary-bar')
  })

  it('MetricsSummaryBarV2 has metrics-summary-bar class for CSS-driven borders', () => {
    const { getByTestId } = render(<MetricsSummaryBarV2 metrics={MOCK_METRICS} lang="ja" />)
    const bar = getByTestId('metrics-summary-bar') as HTMLElement
    expect(bar.classList.contains('metrics-summary-bar')).toBe(true)
  })

  it('StrategyTable wraps with u-scroll-x for horizontal scroll', () => {
    const items: StrategyListItem[] = [
      { strategy_id: 's1', name: 'S1', symbol: 'AAPL', timeframe: '1d' },
    ]
    const { getByTestId } = render(
      <MemoryRouter>
        <StrategyTable
          items={items}
          total={1}
          sortKey="latest_sharpe"
          sortDir="desc"
          onSort={() => {}}
          selectedId={null}
          onSelect={() => {}}
          compareIds={[]}
          onToggleCompare={() => {}}
          lang="ja"
        />
      </MemoryRouter>,
    )
    const wrapper = getByTestId('strategy-table-scroll') as HTMLElement
    expect(wrapper.classList.contains('u-scroll-x')).toBe(true)
  })

  it('StrategyTable hides 4 auxiliary columns under 768px via u-col-hide-md-down', () => {
    const items: StrategyListItem[] = [
      {
        strategy_id: 's1',
        name: 'S1',
        symbol: 'AAPL',
        timeframe: '1d',
        latest_sharpe: 1.2,
        latest_return_pct: 12,
        latest_max_drawdown_pct: -8,
        latest_profit_factor: 1.4,
        latest_win_rate_pct: 55,
        last_run_at: '2026-01-01',
      },
    ]
    const { container } = render(
      <MemoryRouter>
        <StrategyTable
          items={items}
          total={1}
          sortKey="latest_sharpe"
          sortDir="desc"
          onSort={() => {}}
          selectedId={null}
          onSelect={() => {}}
          compareIds={[]}
          onToggleCompare={() => {}}
          lang="ja"
        />
      </MemoryRouter>,
    )
    // 補助列: Profit F. / Win % / Last run / Trend の合計 4 列、
    // ヘッダ + 1 行ぶんの td → 8 個に class が付く想定
    const hidden = container.querySelectorAll('.u-col-hide-md-down')
    expect(hidden.length).toBeGreaterThanOrEqual(8)
  })

  it('StrategySlidePanel applies u-drawer-md-down with data-open', () => {
    const strategy: StrategyListItem = {
      strategy_id: 's1',
      name: 'S1',
      symbol: 'AAPL',
      timeframe: '1d',
    }
    const { getByTestId } = render(
      <MemoryRouter>
        <StrategySlidePanel strategy={strategy} onClose={() => {}} lang="ja" />
      </MemoryRouter>,
    )
    const panel = getByTestId('strategy-slide-panel') as HTMLElement
    expect(panel.classList.contains('u-drawer-md-down')).toBe(true)
    expect(panel.getAttribute('data-open')).toBe('true')
    expect(panel.style.width).toBe('var(--slidepanel-width)')
  })
})
