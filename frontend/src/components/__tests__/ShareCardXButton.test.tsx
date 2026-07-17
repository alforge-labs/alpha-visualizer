import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BacktestDetail } from '../../api/types'
import type { ChartTheme } from '../../design/useChartTheme'
import { ShareCardXButton } from '../ShareCardButton'

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

const THEME = { bg: '#fff' } as unknown as ChartTheme

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * X 共有ボタン: カード PNG の保存と X の投稿インテントを1クリックで行い、
 * シェアの摩擦を最小化する（保存した画像は投稿画面で手動添付）。
 */
describe('<ShareCardXButton />', () => {
  it('downloads the card and opens the X post intent in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<ShareCardXButton data={DETAIL} lang="ja" theme={THEME} />)
    await userEvent.click(screen.getByRole('button', { name: /X で共有/ }))

    expect(downloadShareCard).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledTimes(1)
    const [url, target, features] = openSpy.mock.calls[0] ?? []
    expect(String(url)).toContain('https://x.com/intent/post?text=')
    expect(String(url)).toContain(encodeURIComponent('sma_cross_v1'))
    expect(target).toBe('_blank')
    expect(String(features)).toContain('noopener')
  })

  it('renders the en label', () => {
    render(<ShareCardXButton data={DETAIL} lang="en" theme={THEME} />)
    expect(screen.getByRole('button', { name: /Share on X/ })).toBeInTheDocument()
  })
})
