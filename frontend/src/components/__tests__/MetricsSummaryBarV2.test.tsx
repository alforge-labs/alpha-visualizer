import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { BacktestMetrics } from '../../api/types'
import { MetricsSummaryBarV2 } from '../MetricsSummaryBarV2'

/**
 * issue #266: サマリーバーの数値整形を SSoT（lib/format.fmtNumber）経由へ統一する。
 * 直書き toFixed では取引回数（total_trades）が 1000 を超えても桁区切りされず
 * 読みにくかった。SSoT 経由なら桁区切り・null フォールバックが一貫する。
 */
const baseMetrics = {
  total_return_pct: 12.34,
  sharpe_ratio: 1.5,
  max_drawdown_pct: -10,
  win_rate_pct: 55,
  cagr_pct: 9.8,
  profit_factor: 1.6,
  total_trades: 1234,
} as unknown as BacktestMetrics

describe('MetricsSummaryBarV2 number formatting via SSoT (issue #266)', () => {
  it('groups thousands in total_trades', () => {
    render(<MetricsSummaryBarV2 metrics={baseMetrics} lang="ja" />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders the SSoT fallback for missing metric values', () => {
    const partial = { ...baseMetrics, sharpe_ratio: null } as unknown as BacktestMetrics
    render(<MetricsSummaryBarV2 metrics={partial} lang="ja" />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
