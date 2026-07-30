import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { BacktestMetrics } from '../../../api/types'
import { MetricsGrid } from '../MetricsGrid'

/**
 * issue #368: forge が計算して metrics_json に保存済みなのに UI で一切
 * 表示されなかった指標（コスト実績・Kelly・期待値・勝率CI 等）を表示する。
 * コスト控除前後の差は中級者が必ず確認する項目で、資金管理指標（Kelly・CI）は
 * ポジションサイジング判断に直結する。
 */

const base = {
  total_return_pct: 12.3,
  sharpe_ratio: 1.4,
  max_drawdown_pct: 8.2,
  win_rate_pct: 58,
  cagr_pct: 9.1,
  sortino_ratio: 1.8,
  calmar_ratio: 1.1,
  profit_factor: 1.7,
  total_trades: 42,
} as unknown as BacktestMetrics

const withCosts = {
  ...base,
  gross_return_pct: 14.8,
  net_return_pct: 12.3,
  total_commission_paid: 1250.5,
  total_slippage_cost: 830.2,
} as unknown as BacktestMetrics

const withAdvanced = {
  ...base,
  kelly_criterion: 0.18,
  expectancy_pct: 0.42,
  payoff_ratio: 1.35,
  gain_to_pain_ratio: 1.6,
  ulcer_index: 2.4,
  serenity_index: 1.9,
  recovery_factor: 3.2,
  win_rate_ci: { lower_pct: 45.2, upper_pct: 61.3 },
} as unknown as BacktestMetrics

describe('MetricsGrid コストセクション (issue #368)', () => {
  it('コスト系フィールドがあるときコストセクションを表示する', () => {
    render(<MetricsGrid metrics={withCosts} compact={false} lang="ja" />)
    const grid = screen.getByTestId('cost-grid')
    expect(within(grid).getByText(/グロスリターン/)).toBeInTheDocument()
    expect(within(grid).getByText(/ネットリターン/)).toBeInTheDocument()
    expect(within(grid).getByText(/手数料合計/)).toBeInTheDocument()
    expect(within(grid).getByText(/スリッページ合計/)).toBeInTheDocument()
    // コスト負担 = グロス 14.8 − ネット 12.3 = 2.5%pt（コスト負け耐性の判断材料）
    expect(within(grid).getByText(/コスト負担/)).toBeInTheDocument()
    expect(within(grid).getByText('2.500%')).toBeInTheDocument()
  })

  it('コスト系フィールドが無い旧 run ではコストセクションを出さない', () => {
    render(<MetricsGrid metrics={base} compact={false} lang="ja" />)
    expect(screen.queryByTestId('cost-grid')).not.toBeInTheDocument()
  })
})

describe('MetricsGrid 上級指標セクション (issue #368)', () => {
  it('折りたたみ（既定で閉）の上級指標セクションに Kelly・勝率CI 等を表示する', () => {
    render(<MetricsGrid metrics={withAdvanced} compact={false} lang="ja" />)
    const details = screen.getByTestId('advanced-metrics')
    // 既定で折りたたまれている（初級者のノイズにしない）
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText(/上級指標/)).toBeInTheDocument()
    // Kelly は資金比率（0.18）を % で表示する（issue #359: 整数は小数なし）
    expect(within(details).getByText('18%')).toBeInTheDocument()
    // 勝率 90% CI はレンジ表示
    expect(within(details).getByText('45.2–61.3%')).toBeInTheDocument()
    expect(within(details).getByText(/期待値/)).toBeInTheDocument()
    expect(within(details).getByText(/Payoff/)).toBeInTheDocument()
    expect(within(details).getByText(/Ulcer/)).toBeInTheDocument()
  })

  it('上級指標フィールドが無い旧 run ではセクションを出さない', () => {
    render(<MetricsGrid metrics={base} compact={false} lang="ja" />)
    expect(screen.queryByTestId('advanced-metrics')).not.toBeInTheDocument()
  })
})
