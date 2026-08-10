import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    listOrphanRuns: vi.fn(),
    pruneOrphanRuns: vi.fn(),
    getVersions: vi.fn(),
    startComponentUpdate: vi.fn(),
    getHealth: vi.fn(),
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
import type { ComponentVersion, JobSummary } from '../../api/types'

beforeEach(() => {
  vi.mocked(api.listOrphanRuns).mockReset()
  vi.mocked(api.pruneOrphanRuns).mockReset()
  // このテストファイルはバージョン表示（useVersions）を検証対象にしていない。
  // 未 mock だと api.getVersions が undefined になり useVersions の effect が
  // TypeError で落ちるため、常に空一覧を返すデフォルトを与える。
  vi.mocked(api.getVersions).mockReset().mockResolvedValue({ components: [] })
  vi.mocked(api.startComponentUpdate).mockReset()
  vi.mocked(api.getHealth).mockReset()
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

/**
 * SSE をテスト内で駆動するための EventSource スタブ。
 * `useJobRunner.test.tsx` の FakeEventSource と同じ実装。
 */
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

const FORGE_OUTDATED: ComponentVersion = {
  id: 'forge', status: 'ok', current: '1.9.2', latest: '1.9.3',
  update_available: true, updatable: true, message: null, as_of: null,
}
const VIS_OUTDATED: ComponentVersion = {
  id: 'visualizer', status: 'ok', current: '1.5.0', latest: '1.6.0',
  update_available: true, updatable: true, message: null, as_of: null,
}

function jobSummary(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    job_id: 'job-1',
    kind: 'forge_self_update',
    strategy_id: '',
    symbol: '',
    status: 'queued',
    created_at: '2026-08-10T00:00:00Z',
    started_at: null,
    finished_at: null,
    error: null,
    ...overrides,
  }
}

/**
 * レビュー Important: ジョブ作成 API（`POST /api/versions/{component}/update`）が
 * 4xx/5xx やネットワークエラーで失敗すると、useJobRunnerCore は finish() を
 * 呼ばず onFinished も発火せず false を返すだけで終わる。updatingId が
 * onFinished の中でしか戻らない実装のままだと、更新ボタンが二度と押せなくなる
 * （ページ全体のリロードでしか復旧できない）。
 */
describe('MaintenancePage ツール更新: 起動失敗からの復旧 (review Important)', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    // このブロックはツール更新の配線のみを検証対象にしている。孤児一覧は
    // 未 mock だと undefined.then で落ちるため、空一覧を既定にする。
    vi.mocked(api.listOrphanRuns).mockResolvedValue({ orphans: [], count: 0, total_bytes: 0 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('更新起動が失敗しても更新ボタンが再び押せる状態に戻る', async () => {
    vi.mocked(api.getVersions).mockReset().mockResolvedValue({ components: [FORGE_OUTDATED] })
    vi.mocked(api.startComponentUpdate).mockRejectedValue(
      new ApiError('API 409: {"detail":"他のジョブが実行中です"}', 409, '/api/versions/forge/update'),
    )

    render(
      <MemoryRouter initialEntries={['/maintenance']}>
        <MaintenancePage />
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: /更新/ })
    fireEvent.click(button)

    // 起動直後は「更新中…」で disabled になる
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /更新中/ })).toBeDisabled()
    })

    // ジョブ作成の失敗が解決した後、ボタンは「更新」に戻り再度押せる
    await waitFor(() => {
      const restored = screen.getByRole('button', { name: /^更新$/ })
      expect(restored).toBeEnabled()
    })
    // SSE は一切張られていない（ジョブが作られていないため）
    expect(FakeEventSource.instances).toHaveLength(0)
  })
})

/**
 * レビュー Important 3: onFinished の分岐（成功パスのみ後処理へ進む）を
 * 直接検証するテストが無かった。特に「更新失敗時に再起動待ちへ入らない」
 * ことは、ここを取り違えると更新に失敗したユーザーがずっと「再起動中…」の
 * まま待たされる（サーバーは何も再起動していない）ため必ず固定する。
 */
describe('MaintenancePage ツール更新: 完了後の分岐 (review Important 3)', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    // このブロックはツール更新の配線のみを検証対象にしている。孤児一覧は
    // 未 mock だと undefined.then で落ちるため、空一覧を既定にする。
    vi.mocked(api.listOrphanRuns).mockResolvedValue({ orphans: [], count: 0, total_bytes: 0 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function clickUpdateAndGetStream(
    component: ComponentVersion,
  ): Promise<FakeEventSource> {
    vi.mocked(api.getVersions).mockReset().mockResolvedValue({ components: [component] })
    vi.mocked(api.startComponentUpdate).mockResolvedValue(
      jobSummary({ kind: `${component.id}_self_update` }),
    )

    render(
      <MemoryRouter initialEntries={['/maintenance']}>
        <MaintenancePage />
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: /更新/ })
    fireEvent.click(button)

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    return FakeEventSource.instances[0]!
  }

  it('forge の更新が失敗しても一覧を再取得しない', async () => {
    const es = await clickUpdateAndGetStream(FORGE_OUTDATED)
    expect(api.getVersions).toHaveBeenCalledTimes(1)

    act(() => {
      es.emit({ type: 'status', status: 'failed', result: null, error: 'exit 1' })
    })

    // 失敗・キャンセル時は何もしない設計。一覧の再取得は起きない
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled()
    })
    expect(api.getVersions).toHaveBeenCalledTimes(1)
  })

  it('visualizer の更新が失敗しても再起動待ちへ入らない', async () => {
    const es = await clickUpdateAndGetStream(VIS_OUTDATED)

    act(() => {
      es.emit({ type: 'status', status: 'failed', result: null, error: 'exit 1' })
    })

    // 再起動は成功パスにのみ紐づく。失敗時は待機表示も health ポーリングも起きない
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled()
    })
    expect(screen.queryByText(/再起動中/)).toBeNull()
    expect(api.getHealth).not.toHaveBeenCalled()
  })

  it('forge の更新が成功すると一覧を再取得する', async () => {
    const es = await clickUpdateAndGetStream(FORGE_OUTDATED)

    act(() => {
      es.emit({ type: 'status', status: 'succeeded', result: null, error: null })
    })

    await waitFor(() => expect(api.getVersions).toHaveBeenCalledTimes(2))
    // visualizer 側の再起動待ちには入らない
    expect(screen.queryByText(/再起動中/)).toBeNull()
  })

  it('visualizer の更新が成功すると再起動待ちに入る', async () => {
    const es = await clickUpdateAndGetStream(VIS_OUTDATED)

    act(() => {
      es.emit({ type: 'status', status: 'succeeded', result: null, error: null })
    })

    await waitFor(() => {
      expect(screen.getByText(/再起動中/)).toBeInTheDocument()
    })
    // forge 側の一覧再取得（reload）はマウント時の 1 回のみ
    expect(api.getVersions).toHaveBeenCalledTimes(1)
  })
})
