import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    getSetupStatus: vi.fn(),
    listStrategies: vi.fn(),
    listResults: vi.fn(),
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
  // 「今後表示しない」の永続化検証には localStorage が必要だが、ローカルの
  // vitest（node 環境）には実在しない（CI の jsdom には実在する）。両環境で
  // 同じ挙動になるよう、無ければ in-memory シムを立てる。
  if (globalThis.localStorage == null) {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  }
  globalThis.localStorage.clear()
  resetViewerSettingsStoreForTest()
  vi.mocked(api.getSetupStatus).mockReset().mockResolvedValue(ALL_OK)
  vi.mocked(api.listStrategies)
    .mockReset()
    .mockResolvedValue([{ strategy_id: 'sma_cross' } as never])
  vi.mocked(api.listResults).mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllGlobals()
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

  /** issue #493: ステップガイドの完了判定は既存 API の件数で行う。 */
  it('戦略・run の実データからガイドの完了判定を組み立てる', async () => {
    renderPage()
    // 準備完了バナーにも同名リンクがあるため、ガイドの region にスコープする
    const guide = within(await screen.findByRole('region', { name: 'はじめての戦略作成' }))
    // 戦略 1 件 → 「戦略を作る」完了・data(count 3) → 「データを取得する」完了・
    // run 0 件 → 「バックテスト結果を見る」未完了
    expect(guide.getAllByText('完了')).toHaveLength(2)
    // 最初の戦略の detail へプリセットされる
    expect(
      guide.getByRole('link', { name: /バックテスト結果を見る/ }).getAttribute('href'),
    ).toBe('/detail/sma_cross')
  })

  it('「今後表示しない」が localStorage に永続化され再マウント後も効く', async () => {
    const first = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /今後表示しない/ }))
    expect(screen.queryByText('はじめての戦略作成')).not.toBeInTheDocument()
    first.unmount()

    renderPage()
    await screen.findByText(/準備完了/)
    expect(screen.queryByText('はじめての戦略作成')).not.toBeInTheDocument()
    // 再表示ボタンから戻れる
    fireEvent.click(screen.getByRole('button', { name: /ガイドを再表示/ }))
    expect(screen.getByText('はじめての戦略作成')).toBeInTheDocument()
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
