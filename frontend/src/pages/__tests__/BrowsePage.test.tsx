import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { listStrategies: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number
    url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  },
}))

// BrowseScreen は画面全体を描画するため、このテストの関心（エラー導線）
// の外にあるものはスタブする
vi.mock('../../screens/BrowseScreen', () => ({
  BrowseScreen: () => <div data-testid="browse-screen" />,
}))

import { api } from '../../api/client'
import { BrowsePage } from '../BrowsePage'

beforeEach(() => {
  vi.mocked(api.listStrategies).mockReset()
})

/**
 * issue #390: Browse は取得失敗時に生のエラー文字列（"API 500: {...}"）を
 * そのまま表示し、再試行導線も無かった。他画面（Detail / Compare /
 * Maintenance）と同じ「正規化 + ErrorBanner + 再試行」ポリシーへ揃える。
 */
describe('BrowsePage error handling (issue #390)', () => {
  it('shows a normalized ErrorBanner instead of the raw error text', async () => {
    vi.mocked(api.listStrategies).mockRejectedValue(
      new Error('API 500: {"detail":"internal"}'),
    )
    render(
      <MemoryRouter>
        <BrowsePage />
      </MemoryRouter>,
    )
    const alert = await waitFor(() => screen.getByRole('alert'))
    // 生 JSON・ステータス断片を可視テキストに出さない（title 属性には残る）
    expect(alert.textContent).not.toContain('API 500:')
    expect(alert.textContent).not.toContain('{')
    expect(alert.textContent).toContain('サーバーでエラーが発生しました')
  })

  it('retries the fetch when the retry button is clicked', async () => {
    vi.mocked(api.listStrategies)
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue([])
    render(
      <MemoryRouter>
        <BrowsePage />
      </MemoryRouter>,
    )
    const retry = await waitFor(() => screen.getByRole('button', { name: '再試行' }))
    fireEvent.click(retry)
    await waitFor(() => {
      expect(screen.getByTestId('browse-screen')).toBeInTheDocument()
    })
    expect(vi.mocked(api.listStrategies).mock.calls.length).toBe(2)
  })
})
