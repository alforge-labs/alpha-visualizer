import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    listOrphanRuns: vi.fn(),
    pruneOrphanRuns: vi.fn(),
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

import { api, ApiError } from '../../api/client'
import { MaintenancePage } from '../MaintenancePage'

beforeEach(() => {
  vi.mocked(api.listOrphanRuns).mockReset()
  vi.mocked(api.pruneOrphanRuns).mockReset()
})

/**
 * レビュー Important 1: 一覧取得失敗時、ErrorBanner に生の
 * "API <status>: <JSON body>" がそのまま流れ込み、中括弧と HTTP ステータスに
 * 包まれたサーバー内部形式が画面に出ていた（直前のコミットで意図した
 * 「親切な導線への変換」が未達成だった）。E2E は alforgelabs.com の含有しか
 * 見ておらず、生 JSON のままでも通ってしまうため、ここで単体テストとして
 * 「API 500: を含まない」ことまで固定する。
 */
describe('MaintenancePage error normalization (review: Important 1)', () => {
  it('一覧取得失敗時、生の JSON ではなくサーバーの detail 文言を表示する', async () => {
    const rawMessage =
      'API 500: {"detail":"お使いの alpha-forge にはこのコマンドがありません。新しいバージョンへ更新してください / Your alpha-forge does not have this command. Please update to a newer version — https://alforgelabs.com"}'
    vi.mocked(api.listOrphanRuns).mockRejectedValue(
      new ApiError(rawMessage, 500, '/api/maintenance/orphan-runs'),
    )

    render(
      <MemoryRouter initialEntries={['/maintenance']}>
        <MaintenancePage />
      </MemoryRouter>,
    )

    const alert = await waitFor(() => screen.getByRole('alert'))
    // 生の JSON・HTTP ステータスの断片が UI テキストに出ない
    // （title 属性には残るが textContent には含まれない）
    expect(alert.textContent).not.toContain('API 500:')
    expect(alert.textContent).not.toContain('"detail"')
    expect(alert.textContent).not.toContain('{')
    // サーバー detail のユーザー向け文言（更新導線）が出る
    expect(alert.textContent).toContain('alforgelabs.com')
  })

  it('forge 未導入（503 + code）のとき表示言語のみのメッセージを表示する', async () => {
    // サーバーの detail は curl 利用者向けに日英連結のままだが、UI では
    // 機械可読 code から表示言語のみの文言へ写像する（issue #358）。
    const rawMessage =
      'API 503: {"detail":"alpha-forge コマンドが見つかりません。AlphaForge を導入してください / alpha-forge command not found in PATH. Install AlphaForge — https://alforgelabs.com","code":"forge_cli_not_found"}'
    vi.mocked(api.listOrphanRuns).mockRejectedValue(
      new ApiError(rawMessage, 503, '/api/maintenance/orphan-runs'),
    )

    render(
      <MemoryRouter initialEntries={['/maintenance']}>
        <MaintenancePage />
      </MemoryRouter>,
    )

    const alert = await waitFor(() => screen.getByRole('alert'))
    // 表示言語（既定 ja）の文言だけが出る（日英連結を出さない）
    expect(alert.textContent).toContain('alpha-forge コマンドが見つかりません')
    expect(alert.textContent).not.toContain('not found in PATH')
    // AlphaForge への導線 URL は維持する
    expect(alert.textContent).toContain('alforgelabs.com')
  })

  it('再試行ボタンを押すと一覧を再取得する', async () => {
    vi.mocked(api.listOrphanRuns).mockRejectedValueOnce(
      new ApiError('API 500: {"detail":"サーバーエラー"}', 500, '/api/maintenance/orphan-runs'),
    )
    vi.mocked(api.listOrphanRuns).mockResolvedValueOnce({
      orphans: [],
      count: 0,
      total_bytes: 0,
    })

    render(
      <MemoryRouter initialEntries={['/maintenance']}>
        <MaintenancePage />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByRole('alert'))
    fireEvent.click(screen.getByRole('button', { name: /再試行/ }))

    await waitFor(() => expect(api.listOrphanRuns).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
