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

/**
 * issue #351: 取引 0 件の run では forge が Sharpe / Sortino にセンチネル値
 * -100 を書き込む。これを「-100.00」と赤字で表示すると初級者は壊滅的に
 * 悪い戦略と誤読するため、「—」+ 算出不可の注釈に置き換える。
 */
describe('MetricsSummaryBarV2 no-trade sentinel (issue #351)', () => {
  const noTradeMetrics = {
    ...baseMetrics,
    sharpe_ratio: -100.0,
    total_trades: 0,
  } as unknown as BacktestMetrics

  it('renders — with an annotation instead of -100.00', () => {
    render(<MetricsSummaryBarV2 metrics={noTradeMetrics} lang="ja" />)
    expect(screen.queryByText('-100.00')).not.toBeInTheDocument()
    expect(screen.getByText(/取引なしのため算出不可/)).toBeInTheDocument()
  })

  it('does not paint the sentinel as a danger value', () => {
    render(<MetricsSummaryBarV2 metrics={noTradeMetrics} lang="ja" />)
    const dashes = screen.getAllByText('—')
    expect(dashes.some((el) => (el as HTMLElement).style.color === 'var(--danger)')).toBe(false)
  })
})
