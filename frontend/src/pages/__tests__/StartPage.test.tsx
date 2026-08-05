import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    getSetupStatus: vi.fn(),
  },
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

import { api } from '../../api/client'
import type { SetupStatusResponse } from '../../api/types'
import { resetViewerSettingsStoreForTest } from '../../hooks/useTheme'
import { StartPage } from '../StartPage'

const ALL_OK: SetupStatusResponse = {
  ready: true,
  cli: { status: 'ok', version: '1.3.0' },
  eula: { status: 'ok' },
  workspace: { status: 'ok', config_path: '~/ws/forge.yaml' },
  auth: { status: 'ok', logged_in: true, plan_type: 'paid' },
  data: { status: 'ok', count: 3 },
}

beforeEach(() => {
  globalThis.localStorage?.clear()
  resetViewerSettingsStoreForTest()
  vi.mocked(api.getSetupStatus).mockReset().mockResolvedValue(ALL_OK)
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <StartPage />
    </MemoryRouter>,
  )
}

/** issue #492: /start はセットアップ状態 API を取得してチェックリストを描画する。 */
describe('StartPage (issue #492)', () => {
  it('セットアップ状態を取得してチェックリストを描画する', async () => {
    renderPage()
    expect(await screen.findByText(/準備完了/)).toBeInTheDocument()
    expect(screen.getByText(/v1\.3\.0/)).toBeInTheDocument()
    expect(api.getSetupStatus).toHaveBeenCalledTimes(1)
  })

  it('取得エラー時は再試行で再取得する', async () => {
    vi.mocked(api.getSetupStatus)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(ALL_OK)
    renderPage()
    const retry = await screen.findByRole('button', { name: /再試行/ })
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText(/準備完了/)).toBeInTheDocument())
    expect(api.getSetupStatus).toHaveBeenCalledTimes(2)
  })
})
