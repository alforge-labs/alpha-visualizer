import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    listDatasets: vi.fn(),
    createDataJob: vi.fn(),
    cancelJob: vi.fn(),
    getJob: vi.fn(),
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
import { ApiError } from '../../api/client'
import type { JobSummary } from '../../api/types'
import { resetViewerSettingsStoreForTest } from '../../hooks/useTheme'
import { DataPage } from '../DataPage'

/** SSE をテスト内で駆動するための EventSource スタブ（DevelopPage.test.tsx と同じ形）。 */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  close(): void {
    this.closed = true
  }

  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

function dataJobSummary(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    job_id: 'job-data-1',
    kind: 'data_fetch',
    strategy_id: '',
    symbol: 'CL=F',
    status: 'queued',
    created_at: '2026-08-05T00:00:00Z',
    started_at: null,
    finished_at: null,
    error: null,
    ...overrides,
  }
}

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
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.mocked(api.listDatasets).mockReset().mockResolvedValue(DATASETS as never)
  vi.mocked(api.createDataJob).mockReset()
  vi.mocked(api.cancelJob).mockReset()
  vi.mocked(api.getJob).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    // '4h' は取得フォームの select option にも存在するため、テーブルセル側を検証する
    expect(screen.getAllByText('4h').some((el) => el.closest('td') !== null)).toBe(true)
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

  it('データ0件のときは取得フォームへの案内を表示する', async () => {
    vi.mocked(api.listDatasets).mockResolvedValueOnce({ datasets: [], count: 0 } as never)
    renderPage()
    expect(await screen.findByText(/まだデータがありません/)).toBeInTheDocument()
    // GUI 取得（issue #485）が入ったため CLI コマンドではなくフォームへ誘導する
    expect(screen.getByLabelText(/取得する銘柄/)).toBeInTheDocument()
  })

  it('クエリパラメータで取得フォームをプリフィルする (issue #486)', async () => {
    // no_data 地点からの導線（SignalChartCard / Develop 画面）はプリフィル付きで
    // 遷移してくる。1 クリックで「取得」まで進める状態にする。
    render(
      <MemoryRouter initialEntries={['/data?symbol=GC%3DF&interval=4h']}>
        <DataPage />
      </MemoryRouter>,
    )
    await screen.findByText('SPY')
    expect(screen.getByLabelText(/取得する銘柄/)).toHaveValue('GC=F')
    expect(screen.getByLabelText(/足/)).toHaveValue('4h')
  })

  it('不正な interval クエリは既定値にフォールバックする', async () => {
    render(
      <MemoryRouter initialEntries={['/data?symbol=SPY&interval=evil']}>
        <DataPage />
      </MemoryRouter>,
    )
    await screen.findByText('SPY', { selector: 'td' })
    expect(screen.getByLabelText(/足/)).toHaveValue('1d')
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

/**
 * issue #485: データ取得・更新を GUI から実行できるようにする。
 * 初中級者の最初のつまずき所（CLI で data fetch を打てない）を解消する。
 */
describe('DataPage 取得・更新ジョブ (issue #485)', () => {
  it('フォームから取得ジョブを起動し、完了で一覧を再取得する', async () => {
    vi.mocked(api.createDataJob).mockResolvedValue(dataJobSummary())
    renderPage()
    await screen.findByText('SPY')

    fireEvent.change(screen.getByLabelText(/取得する銘柄/), { target: { value: 'CL=F' } })
    fireEvent.change(screen.getByLabelText(/期間/), { target: { value: '5y' } })
    fireEvent.change(screen.getByLabelText(/足/), { target: { value: '1d' } })
    fireEvent.click(screen.getByRole('button', { name: /取得/ }))

    await waitFor(() =>
      expect(api.createDataJob).toHaveBeenCalledWith({
        action: 'fetch',
        symbol: 'CL=F',
        period: '5y',
        interval: '1d',
      }),
    )

    // SSE 完了 → 一覧の再取得（鮮度・新規銘柄の反映）
    const es = FakeEventSource.instances[0]!
    act(() => {
      es.emit({ type: 'status', status: 'succeeded', result: null, error: null })
    })
    await waitFor(() => expect(api.listDatasets).toHaveBeenCalledTimes(2))
  })

  it('「すべて更新」で update ジョブを起動する', async () => {
    vi.mocked(api.createDataJob).mockResolvedValue(
      dataJobSummary({ job_id: 'job-data-2', kind: 'data_update', symbol: '' }),
    )
    renderPage()
    await screen.findByText('SPY')

    fireEvent.click(screen.getByRole('button', { name: /すべて更新/ }))
    await waitFor(() =>
      expect(api.createDataJob).toHaveBeenCalledWith({ action: 'update' }),
    )
  })

  it('実行中はログが流れ、キャンセルできる', async () => {
    vi.mocked(api.createDataJob).mockResolvedValue(dataJobSummary())
    vi.mocked(api.cancelJob).mockResolvedValue(
      dataJobSummary({ status: 'cancelled' }) as never,
    )
    renderPage()
    await screen.findByText('SPY')

    fireEvent.change(screen.getByLabelText(/取得する銘柄/), { target: { value: 'CL=F' } })
    fireEvent.click(screen.getByRole('button', { name: /取得/ }))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))

    const es = FakeEventSource.instances[0]!
    act(() => {
      es.emit({ type: 'snapshot', status: 'running', lines: ['Fetching CL=F...'], seq: 1 })
    })
    expect(await screen.findByText(/Fetching CL=F/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }))
    await waitFor(() => expect(api.cancelJob).toHaveBeenCalledWith('job-data-1'))
  })

  it('ジョブ失敗はエラーとして表示する', async () => {
    vi.mocked(api.createDataJob).mockResolvedValue(dataJobSummary())
    renderPage()
    await screen.findByText('SPY')

    fireEvent.change(screen.getByLabelText(/取得する銘柄/), { target: { value: 'BAD' } })
    fireEvent.click(screen.getByRole('button', { name: /取得/ }))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))

    const es = FakeEventSource.instances[0]!
    act(() => {
      es.emit({
        type: 'status',
        status: 'failed',
        result: null,
        error: 'データ取得に失敗しました: No data found for BAD',
      })
    })
    expect(await screen.findByText(/No data found for BAD/)).toBeInTheDocument()
    // 失敗では一覧を再取得しない
    expect(api.listDatasets).toHaveBeenCalledTimes(1)
  })

  /**
   * issue #507: ジョブ「作成」自体が失敗する経路（403 local_write_disabled /
   * 503 forge_cli_not_found）はジョブが生成されず SSE も張られないため、
   * 上の「ジョブ失敗」テスト（SSE で failed を受ける経路）とは別物。
   * hook が status を進めないままだと `status === 'failed'` を要求する表示条件に
   * 到達せず、「ボタンを押しても何も起きない」状態になっていた。
   */
  it('ジョブ作成が 403 で失敗した場合も意味のあるエラーを表示する (issue #507)', async () => {
    vi.mocked(api.createDataJob).mockRejectedValue(
      new ApiError(
        'API 403: {"detail":"この操作は localhost でのみ利用できます（LAN 公開中は無効） / This operation is only available on localhost","code":"local_write_disabled"}',
        403,
        '/api/data/jobs',
      ),
    )
    renderPage()
    await screen.findByText('SPY')

    fireEvent.click(screen.getByRole('button', { name: /すべて更新/ }))

    // サーバーの detail（利用者向け文言）が表示され、内部識別子や ApiError の
    // 生文字列は露出しないこと
    expect(await screen.findByText(/localhost/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('local_write_disabled')
    expect(document.body.textContent).not.toContain('API 403')
    // 作成自体が失敗しているので SSE 購読は発生しない
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('ダークへ切り替えると variation も lab へ揃う', async () => {
    // theme だけ更新して variation を放置すると、データ画面だけ配色が
    // 他画面と揃わない。他の 6 画面（Compare / Detail / Ideas / Live /
    // Develop / Start）は theme と variation を同時に更新しており、
    // DataPage だけ流儀が割れていた回帰を固定する。
    vi.mocked(api.listDatasets).mockResolvedValue(DATASETS)
    renderPage()
    await screen.findByText('SPY')

    fireEvent.click(screen.getByRole('radio', { name: 'ダークモード' }))

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark')
    })
    expect(document.documentElement.dataset.variation).toBe('lab')
  })
})
