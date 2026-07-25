import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LiveSummary } from '../../../api/types'
import { LivePositionView } from '../LivePositionView'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// TV チャートをスタブする（このファイルの関心は KPI・建玉テーブル・シェア導線であり、チャート内部ではない）
vi.mock('../../../charts/tv/EquityDrawdownPaneTV', () => ({
  EquityDrawdownPaneTV: () => <div data-testid="equity-pane-stub" />,
}))

vi.mock('../../../lib/shareCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/shareCard')>()
  return { ...actual, downloadLiveShareCard: vi.fn() }
})

import { downloadLiveShareCard } from '../../../lib/shareCard'

const SUMMARY = {
  strategy_id: 'beat_qqq_hedged_v1',
  portfolio_id: 'beat_qqq_hedged_v1',
  kind: 'position',
  metrics: {
    total_return_pct: 5.4,
    cagr_pct: 11.2,
    sharpe_ratio: 1.31,
    // LivePositionMetrics の max_drawdown_pct は正値規約
    max_drawdown_pct: 6.5,
    volatility_pct: 9.9,
  },
  backtest_metrics: null,
  equity: [
    ['2026-05-01', 10000],
    ['2026-05-02', 10100],
    ['2026-05-03', 10250],
  ],
  receipts_count: 3,
  sub_strategies: ['gld_bh_v1'],
  updated_at: '2026-06-06T10:50:22+00:00',
} as unknown as LiveSummary

/**
 * Live（ポジションベース）画面のシェアカード導線（Wave 4）:
 * ペーパートレード実績＝実運用の証拠を1枚のカードとしてシェアでき、
 * カードが AlphaForge の認知経路になる。
 */
describe('<LivePositionView /> share card', () => {
  it('renders a share button and triggers the live share card download', async () => {
    render(<LivePositionView summary={SUMMARY} warnings={[]} lang="ja" />)
    const btn = screen.getByRole('button', { name: /シェアカード/ })
    await userEvent.click(btn)
    expect(downloadLiveShareCard).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadLiveShareCard).mock.calls[0]?.[0]).toBe(SUMMARY)
    expect(vi.mocked(downloadLiveShareCard).mock.calls[0]?.[1]).toBe('ja')
  })

  it('renders an X share button that downloads the card and opens the post intent', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<LivePositionView summary={SUMMARY} warnings={[]} lang="ja" />)
    await userEvent.click(screen.getByRole('button', { name: /X で共有/ }))
    expect(downloadLiveShareCard).toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = String(openSpy.mock.calls[0]?.[0])
    expect(url).toContain('https://x.com/intent/post?text=')
    expect(url).toContain(encodeURIComponent('beat_qqq_hedged_v1'))
    openSpy.mockRestore()
  })
})

/**
 * 組み立て（Task 13）: KPI 行・比較チャート・建玉テーブルの後方互換。
 *
 * ベンチマーク・backtest 比較・建玉を持たない旧 DB 応答でもクラッシュせず、
 * 存在するデータ（KPI・equity/drawdown チャート）だけを描画することを保証する。
 */
describe('<LivePositionView /> assembly (Task 13)', () => {
  it('ベンチマーク・建玉が無い旧 DB 応答でもクラッシュせず描画する', () => {
    const summary = {
      strategy_id: 'pf_1',
      kind: 'position' as const,
      metrics: {
        total_return_pct: -0.5,
        cagr_pct: -3,
        sharpe_ratio: -2,
        max_drawdown_pct: 0.7,
        volatility_pct: 1.3,
      },
      equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 995_000],
      ] as [string, number][],
      receipts_count: 78,
      // benchmark_equity / backtest_equity / positions は未定義（旧 DB）
    }
    render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)
    expect(screen.getByTestId('kpi-current-value')).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-excess-index')).not.toBeInTheDocument()
  })

  it('ベンチマークがあれば overlays 付きでチャートを描画する', () => {
    const summary = {
      strategy_id: 'pf_1',
      kind: 'position' as const,
      metrics: { total_return_pct: -0.5 },
      equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 995_000],
      ] as [string, number][],
      benchmark_equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 1_020_000],
      ] as [string, number][],
      positions: [
        {
          ticker: 'US.GLD',
          qty: 90,
          avg_cost: 396.64,
          last_price: 371.9,
          market_value: 33471,
          weight_pct: 3.4,
          unrealized_pnl: -2227,
          unrealized_pnl_pct: -6.2,
        },
      ],
      cash: 961_021,
      total_value: 994_492,
      receipts_count: 78,
    }
    render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)
    expect(screen.getByTestId('kpi-excess-index')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
