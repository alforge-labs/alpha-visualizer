import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { BacktestMetrics } from '../../../api/types'
import { MetricsGrid } from '../MetricsGrid'

/**
 * issue #351: 取引 0 件の run では forge が Sharpe / Sortino にセンチネル値
 * -100 を書き込む。「-100.00」の赤表示は初級者に「壊滅的に悪い戦略」と
 * 誤読させるため、「—」+ 算出不可の注釈へ置き換える。
 */
const noTradeMetrics = {
  total_return_pct: 0,
  sharpe_ratio: -100.0,
  sortino_ratio: -100.0,
  max_drawdown_pct: 0,
  win_rate_pct: 0,
  cagr_pct: 0,
  calmar_ratio: 0,
  total_trades: 0,
} as unknown as BacktestMetrics

describe('MetricsGrid no-trade sentinel (issue #351)', () => {
  it('renders — with annotations instead of the sentinel values', () => {
    render(<MetricsGrid metrics={noTradeMetrics} compact={false} lang="ja" />)
    // -100 が実測値として出ない（整数化で '-100'、旧表示なら '-100.00'）
    expect(screen.queryByText('-100')).not.toBeInTheDocument()
    expect(screen.queryByText('-100.00')).not.toBeInTheDocument()
    // Sharpe / Sortino の 2 カードに注釈が付く
    expect(screen.getAllByText(/取引なしのため算出不可/).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps real negative values untouched', () => {
    const bad = { ...noTradeMetrics, sharpe_ratio: -3.21, sortino_ratio: -2.5, total_trades: 4 } as unknown as BacktestMetrics
    render(<MetricsGrid metrics={bad} compact={false} lang="ja" />)
    expect(screen.getByText('-3.210')).toBeInTheDocument()
    expect(screen.queryByText(/取引なしのため算出不可/)).not.toBeInTheDocument()
  })
})
