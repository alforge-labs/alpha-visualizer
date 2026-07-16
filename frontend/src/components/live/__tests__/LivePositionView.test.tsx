import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LiveSummary } from '../../../api/types'
import { LivePositionView } from '../LivePositionView'

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
    max_drawdown_pct: -6.5,
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
})
