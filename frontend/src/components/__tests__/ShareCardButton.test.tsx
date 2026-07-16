import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BacktestDetail } from '../../api/types'
import type { ChartTheme } from '../../design/useChartTheme'
import { ShareCardButton } from '../ShareCardButton'

vi.mock('../../lib/shareCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shareCard')>()
  return { ...actual, downloadShareCard: vi.fn() }
})

import { downloadShareCard } from '../../lib/shareCard'

const DETAIL = {
  strategy_id: 'sma_cross_v1',
  symbol: 'SPY',
  timeframe: '1d',
  period: { start: '2020-01-02', end: '2023-12-29' },
  metrics: {
    total_return_pct: 42.5,
    cagr_pct: 9.31,
    sharpe_ratio: 1.234,
    max_drawdown_pct: -12.7,
    win_rate_pct: 61.5,
  },
  equity: { dates: ['2020-01-02', '2020-01-03'], values: [1, 2] },
} as unknown as BacktestDetail

const THEME = { bg: '#fff', text: '#000' } as unknown as ChartTheme

/**
 * 共有カードボタン: バックテスト結果を SNS シェア可能な PNG として書き出す
 * 入口。ダッシュボード利用者の成果シェアが AlphaForge の認知経路になる（C5）。
 */
describe('<ShareCardButton />', () => {
  it('renders the ja label and triggers the share-card download on click', async () => {
    render(<ShareCardButton data={DETAIL} lang="ja" theme={THEME} />)
    const btn = screen.getByRole('button', { name: /シェアカード/ })
    await userEvent.click(btn)
    expect(downloadShareCard).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadShareCard).mock.calls[0]?.[0]).toBe(DETAIL)
    expect(vi.mocked(downloadShareCard).mock.calls[0]?.[1]).toBe('ja')
    expect(vi.mocked(downloadShareCard).mock.calls[0]?.[2]).toBe(THEME)
  })

  it('renders the en label', () => {
    render(<ShareCardButton data={DETAIL} lang="en" theme={THEME} />)
    expect(screen.getByRole('button', { name: /Share card/ })).toBeInTheDocument()
  })
})
