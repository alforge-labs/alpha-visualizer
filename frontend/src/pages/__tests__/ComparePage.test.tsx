import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { compareStrategies: vi.fn() },
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

import { api, ApiError } from '../../api/client'
import { ComparePage } from '../ComparePage'

beforeEach(() => {
  vi.mocked(api.compareStrategies).mockReset()
})

/**
 * issue #265: fetch 失敗時に再試行導線が無く手動リロード頼みだった。
 * エラー帯の再試行ボタンが、全画面リロードではなく同じ ids のまま
 * compareStrategies を再フェッチすることを UI 経由で検証する。
 */
describe('ComparePage error retry (issue #265)', () => {
  it('shows a retry banner on fetch failure and refetches without a full reload', async () => {
    vi.mocked(api.compareStrategies).mockRejectedValue(
      new ApiError('API 500: Traceback NullPointer at Service.compare()', 500, '/api/strategies/compare'),
    )
    render(
      <MemoryRouter initialEntries={['/compare?ids=a,b']}>
        <ComparePage />
      </MemoryRouter>,
    )

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(api.compareStrategies).toHaveBeenCalledTimes(1)
    // サーバー内部メッセージ（スタックトレース）が UI に露出しないこと
    expect(alert.textContent).not.toContain('Traceback')
    expect(alert.textContent).not.toContain('NullPointer')

    fireEvent.click(within(alert).getByRole('button'))
    await waitFor(() => expect(api.compareStrategies).toHaveBeenCalledTimes(2))
  })
})

/**
 * issue #327: ナビの「比較」は ids なしの /compare へ遷移するため、
 * 本番ビルドでは永久に「読み込み中…」が表示されていた。
 *
 * 原因は useFetchByKey が key=null のとき
 *   IS_DEV && mockFallback ? mock : { status: 'loading' }
 * を返す設計で、PROD では IS_DEV が false に静的置換されて
 * loading に落ちること。開発サーバーでは mock にフォールバックするため
 * 露見しなかった。
 *
 * 未選択は「読み込み中」でも「エラー」でもなく、戦略を選ばせる状態。
 * ページ側で ids 空を明示的に扱い、fetch も発行しないことを検証する。
 */
describe('ComparePage empty selection (issue #327)', () => {
  it('shows guidance instead of a loading spinner when no ids are selected', async () => {
    render(
      <MemoryRouter initialEntries={['/compare']}>
        <ComparePage />
      </MemoryRouter>,
    )

    // 未選択で fetch を投げない（key が無いので投げようがない＝回帰の番人）
    expect(api.compareStrategies).not.toHaveBeenCalled()
    // 「読み込み中…」で固まらない
    expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument()
    // 戦略を選ぶ導線が出ている
    const cta = await screen.findByTestId('compare-empty')
    expect(cta).toBeInTheDocument()
    expect(within(cta).getByRole('button')).toBeInTheDocument()
  })

  it('does not show the empty state once ids are present', async () => {
    vi.mocked(api.compareStrategies).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/compare?ids=a,b']}>
        <ComparePage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(api.compareStrategies).toHaveBeenCalled())
    expect(screen.queryByTestId('compare-empty')).not.toBeInTheDocument()
  })
})
