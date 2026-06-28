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
