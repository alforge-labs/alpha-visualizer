import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { BacktestMetrics } from '../../../api/types'
import { MetricsGrid } from '../MetricsGrid'
import { SignalQualityBadge } from '../SignalQualityBadge'

/**
 * issue #360: 指標説明ツールチップがヘッダー KPI 6 個にしかなく、初級者が
 * 最も意味を知らない詳細カード（Sortino・VaR 等）と SignalQualityBadge
 * （PSR・DSR）には説明が一切なかった。全カードに説明導線があることを保証する。
 */

const metrics = {
  total_return_pct: 12.3,
  sharpe_ratio: 1.4,
  max_drawdown_pct: 8.2,
  win_rate_pct: 58,
  cagr_pct: 9.1,
  sortino_ratio: 1.8,
  calmar_ratio: 1.1,
  profit_factor: 1.7,
  total_trades: 42,
  avg_holding_days: 3.2,
  omega_ratio: 1.2,
  tail_ratio: 1.1,
  var_95_pct: -1.8,
  cvar_95_pct: -2.6,
  exposure_pct: 74,
  positive_month_ratio: 61,
  max_consecutive_wins: 6,
  max_consecutive_losses: 3,
  avg_win_pct: 2.1,
  avg_loss_pct: -1.2,
  max_drawdown_duration_days: 45,
  recovery_days: 30,
  benchmark: {
    alpha_pct: 3.1,
    beta: 0.8,
    information_ratio: 0.9,
    correlation: 0.7,
    benchmark_total_return_pct: 8.0,
    benchmark_cagr_pct: 5.5,
  },
} as unknown as BacktestMetrics

describe('MetricsGrid の指標ツールチップ (issue #360)', () => {
  it('詳細カード（Sortino）にも説明ボタンがあり、開くと目安付き説明が出る', () => {
    render(<MetricsGrid metrics={metrics} compact={false} lang="ja" />)
    const grid = screen.getByTestId('secondary-grid')
    const btn = within(grid).getByRole('button', { name: /ソルティノ/ })
    fireEvent.focus(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/下(方|落)/)
  })

  it('KPI・詳細・ベンチマークの全カードに説明ボタンがある', () => {
    render(<MetricsGrid metrics={metrics} compact={false} lang="ja" />)
    const buttons = screen.getAllByRole('button', { name: /の説明$/ })
    // KPI 4 + 詳細 18 + ベンチマーク 6 = 28
    expect(buttons.length).toBe(28)
  })
})

describe('SignalQualityBadge の指標ツールチップ (issue #360)', () => {
  const svMetrics = {
    statistical_validity: {
      signal_quality_score: 0.8,
      is_valid: true,
      warning: null,
    },
    deflated_sharpe: {
      probabilistic_sr: 0.95,
      deflated_sr: 0.91,
      n_trials: 120,
    },
  } as unknown as BacktestMetrics

  it('PSR / DSR / 試行数に説明ボタンがあり、DSR の説明が開ける', () => {
    render(<SignalQualityBadge metrics={svMetrics} lang="ja" />)
    const dsrBtn = screen.getByRole('button', { name: /DSR.*の説明/ })
    fireEvent.focus(dsrBtn)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/試行/)
    expect(
      screen.getAllByRole('button', { name: /の説明$/ }).length,
    ).toBeGreaterThanOrEqual(4) // スコア + PSR + DSR + 試行数
  })
})
