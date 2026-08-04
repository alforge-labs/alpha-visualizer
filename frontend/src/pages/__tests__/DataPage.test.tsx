import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { listDatasets: vi.fn() },
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
import { ApiError } from '../../api/client'
import { resetViewerSettingsStoreForTest } from '../../hooks/useTheme'
import { DataPage } from '../DataPage'

const DATASETS = {
  datasets: [
    {
      symbol: 'SPY',
      interval: '1d',
      start: '2021-03-23',
      end: '2026-07-24',
      rows: 1306,
      size_bytes: 68279,
      updated_at: '2026-08-04T00:00:00+00:00',
      stale: false,
    },
    {
      symbol: 'QQQ',
      interval: '4h',
      start: '2024-03-25',
      end: '2026-06-01',
      rows: 1138,
      size_bytes: 41866,
      updated_at: '2026-06-01T00:00:00+00:00',
      stale: true,
    },
  ],
  count: 2,
}

beforeEach(() => {
  // 言語切替テストの lang=en がモジュールレベル共有ストア（issue #315）や
  // localStorage 経由で他テストへ漏れないようにする。localStorage は CI の
  // jsdom には実在し（永続化されて再初期化時に読み戻される）、ローカルの
  // node 環境には無い（undefined）ため optional chaining で両対応する。
  globalThis.localStorage?.clear()
  resetViewerSettingsStoreForTest()
  vi.mocked(api.listDatasets).mockReset().mockResolvedValue(DATASETS as never)
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/data']}>
      <DataPage />
    </MemoryRouter>,
  )
}

/**
 * issue #484: 保有ヒストリカルデータの存在・鮮度を確認する手段が CLI にしか
 * なく、未取得銘柄はチャートが no_data になるだけで理由が分からなかった。
 * データ管理画面（一覧 + 鮮度表示）を追加する。
 */
describe('DataPage (issue #484)', () => {
  it('保有データを一覧表示する（銘柄・足・期間・行数）', async () => {
    renderPage()
    expect(await screen.findByText('SPY')).toBeInTheDocument()
    expect(screen.getByText('QQQ')).toBeInTheDocument()
    expect(screen.getByText('4h')).toBeInTheDocument()
    expect(screen.getByText('1,306')).toBeInTheDocument()
    expect(screen.getByText(/2021-03-23/)).toBeInTheDocument()
  })

  it('TTL 超過の行にだけ「要更新」バッジを表示する', async () => {
    renderPage()
    await screen.findByText('SPY')
    const badges = screen.getAllByText('要更新')
    expect(badges).toHaveLength(1)
    // stale な QQQ の行にあり、SPY の行には無い
    expect(badges[0]!.closest('tr')?.textContent).toContain('QQQ')
  })

  it('銘柄で検索絞り込みでき、絞り込み件数が見える', async () => {
    renderPage()
    await screen.findByText('SPY')
    fireEvent.change(screen.getByLabelText(/検索/), { target: { value: 'qqq' } })
    expect(screen.queryByText('SPY')).not.toBeInTheDocument()
    expect(screen.getByText('QQQ')).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 2 件/)).toBeInTheDocument()
  })

  it('データ0件のときは取得コマンドの案内を表示する', async () => {
    vi.mocked(api.listDatasets).mockResolvedValueOnce({ datasets: [], count: 0 } as never)
    renderPage()
    expect(await screen.findByText(/まだデータがありません/)).toBeInTheDocument()
    // GUI 取得（issue #485）が入るまでは CLI コマンドへの導線を出す
    expect(screen.getByText(/alpha-forge data fetch/)).toBeInTheDocument()
  })

  it('言語切替（SettingsToggles）を備え、英語表示に切り替えられる', async () => {
    // 他の主要画面（Browse / Compare / Develop 等）と同じく画面内に言語・テーマ
    // 切替を持つこと。スクリーンショット撮影（switchLanguage ヘルパー）も
    // この radio に依存する。
    renderPage()
    await screen.findByText('SPY')
    fireEvent.click(screen.getByRole('radio', { name: /English/ }))
    expect(await screen.findByText(/2 datasets/)).toBeInTheDocument()
  })

  it('forge 未導入エラーは表示言語の導入案内メッセージにする', async () => {
    vi.mocked(api.listDatasets).mockRejectedValueOnce(
      new ApiError(
        'API 503: {"detail":"alpha-forge コマンドが見つかりません...","code":"forge_cli_not_found"}',
        503,
        '/api/data',
      ),
    )
    renderPage()
    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('alpha-forge コマンドが見つかりません')
    expect(alert.textContent).not.toContain('forge_cli_not_found')
  })
})
