import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => {
  class ApiError extends Error {
    readonly status: number
    readonly url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  }
  return {
    ApiError,
    api: {
      getAgentBackends: vi.fn(),
      createAgentJob: vi.fn(),
      cancelJob: vi.fn(),
      getJob: vi.fn(),
      listDatasets: vi.fn(),
    },
  }
})

import { api, ApiError } from '../../api/client'
import type { AgentBackendsResponse, JobSummary } from '../../api/types'
import { resetAgentBackendsCache } from '../../hooks/useAgentBackends'
import { DevelopPage } from '../DevelopPage'

/** SSE をテスト内で駆動するための EventSource スタブ（TuningPanel.test.tsx / useAgentRunner.test.ts と同じ形）。 */
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

const BOTH_AVAILABLE: AgentBackendsResponse = {
  enabled: true, default_max_turns: 100, max_max_turns: 500,
  backends: [
    { id: 'claude', available: true, version: '1.2.3' },
    { id: 'codex', available: true, version: '0.9.0' },
  ],
}

function jobSummary(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    job_id: 'job-agent-1',
    kind: 'agent',
    strategy_id: '',
    symbol: '',
    status: 'queued',
    created_at: '2026-08-02T00:00:00Z',
    started_at: null,
    finished_at: null,
    error: null,
    ...overrides,
  }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  // useAgentBackends は検出結果をモジュール内で共有する（RootLayout と
  // DevelopPage の二重 fetch を避けるため）。テスト間で持ち越すと、次の
  // テストが自前のモック応答ではなく前のテストの結果を見てしまう
  resetAgentBackendsCache()
  vi.mocked(api.getAgentBackends).mockReset()
  vi.mocked(api.createAgentJob).mockReset()
  vi.mocked(api.cancelJob).mockReset()
  vi.mocked(api.getJob).mockReset()
  // 未取得銘柄の警告（issue #486）用。既定は空一覧（= どの銘柄も未取得扱い）
  vi.mocked(api.listDatasets).mockReset().mockResolvedValue({ datasets: [], count: 0 } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/develop']}>
      <DevelopPage />
    </MemoryRouter>,
  )
}

describe('<DevelopPage />', () => {
  it('useAgentBackends の結果を DevelopScreen に反映しフォームを表示する', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue(BOTH_AVAILABLE)
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(/ゴール/)).toBeInTheDocument())
  })

  it('loading 中は localhost 案内が出ない（初回 fetch 解決前の誤案内防止）', () => {
    // 解決しない Promise で fetch 未解決状態を固定し、loading=true のまま検証する。
    vi.mocked(api.getAgentBackends).mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/localhost/)).toBeNull()
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  it('enabled: false のとき localhost 限定の案内を表示する（直接 URL アクセスのガード）', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue({ enabled: false, default_max_turns: 100, max_max_turns: 500, backends: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText(/localhost/)).toBeInTheDocument())
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  it('取得失敗（backends=null）のときも localhost 限定の案内を表示する（機能を落とさない縮退）', async () => {
    vi.mocked(api.getAgentBackends).mockRejectedValue(new Error('network error'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/localhost/)).toBeInTheDocument())
  })

  it('保有データ一覧を取得し、未取得銘柄の入力で警告が出る (issue #486)', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue(BOTH_AVAILABLE)
    vi.mocked(api.listDatasets).mockResolvedValue({
      datasets: [
        {
          symbol: 'SPY', interval: '1d', start: '2020-01-02', end: '2026-07-28',
          rows: 1652, size_bytes: 84992, updated_at: null, stale: null,
        },
      ],
      count: 1,
    } as never)
    renderPage()

    await waitFor(() => expect(screen.getByLabelText(/銘柄/)).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText(/銘柄/), 'CL=F')
    expect(await screen.findByText(/未取得/)).toBeInTheDocument()
  })

  it('開始操作で onStart 経由 api.createAgentJob が symbol=null で呼ばれ、SSE 完了で結果リンクが出る', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue(BOTH_AVAILABLE)
    vi.mocked(api.createAgentJob).mockResolvedValue(jobSummary())
    renderPage()

    await waitFor(() => expect(screen.getByLabelText(/ゴール/)).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText(/ゴール/), 'CL=F の勝率を改善したい')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))

    await waitFor(() =>
      expect(api.createAgentJob).toHaveBeenCalledWith({
        goal: 'CL=F の勝率を改善したい',
        symbol: null,
        backend: 'claude',
        // ターン上限は未入力 → null を明示的に送り、サーバー既定に任せる
        max_turns: null,
      }),
    )

    const es = FakeEventSource.instances[0]!
    act(() => {
      es.emit({
        type: 'status',
        status: 'succeeded',
        result: { strategy_id: 'cl_hmm_bb_rsi_v1' },
        error: null,
      })
    })

    await waitFor(() => {
      const links = screen.getAllByRole('link')
      expect(links.some((l) => l.getAttribute('href') === '/detail/cl_hmm_bb_rsi_v1')).toBe(true)
    })
  })

  /**
   * issue #507: `POST /api/agent/jobs` は派生元戦略の不在を 404 で fail-fast する。
   * これは `useAgentBackends` の事前検出では防げない経路（`?base=<id>` が無効な
   * 戦略を指しているケース）で、ジョブが生成されないため SSE も張られない。
   * hook が status を進めないままだと DevelopScreen の `status === 'failed'`
   * 分岐に到達せず、利用者には「開始を押しても何も起きない」ように見える。
   */
  it('ジョブ作成が 404（派生元不在）で失敗した場合もエラーを表示する (issue #507)', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue(BOTH_AVAILABLE)
    vi.mocked(api.createAgentJob).mockRejectedValue(
      new ApiError(
        'API 404: {"detail":"戦略が見つかりません / Strategy not found: ghost_v1"}',
        404,
        '/api/agent/jobs',
      ),
    )
    renderPage()

    await waitFor(() => expect(screen.getByLabelText(/ゴール/)).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText(/ゴール/), 'ゴール')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))

    // サーバーの detail（利用者向け文言）が表示され、ApiError の生文字列
    // （"API 404: {...}"）はそのまま露出しないこと
    expect(await screen.findByText(/戦略が見つかりません/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('API 404')
    // 作成自体が失敗しているので SSE 購読は発生しない
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('キャンセルボタンで onCancel 経由 api.cancelJob が呼ばれる', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue(BOTH_AVAILABLE)
    vi.mocked(api.createAgentJob).mockResolvedValue(jobSummary())
    vi.mocked(api.cancelJob).mockResolvedValue(jobSummary({ status: 'cancelled' }))
    renderPage()

    await waitFor(() => expect(screen.getByLabelText(/ゴール/)).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText(/ゴール/), 'ゴール')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))
    await waitFor(() => expect(api.createAgentJob).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: /キャンセル/ }))
    await waitFor(() => expect(api.cancelJob).toHaveBeenCalledWith('job-agent-1'))
  })
})

/**
 * issue #491: /develop?base=<id> で開始すると base_strategy_id 付きで
 * ジョブが作成される（Detail の「AI で改善」導線から遷移してくる）。
 */
describe('DevelopPage 派生開発 (issue #491)', () => {
  it('base クエリがあると createAgentJob に base_strategy_id が渡る', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue(BOTH_AVAILABLE)
    vi.mocked(api.createAgentJob).mockResolvedValue(jobSummary())
    render(
      <MemoryRouter initialEntries={['/develop?base=base_s1']}>
        <DevelopPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText(/ゴール/)).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText(/ゴール/), 'トレード頻度を下げて')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))

    await waitFor(() =>
      expect(api.createAgentJob).toHaveBeenCalledWith({
        goal: 'トレード頻度を下げて',
        symbol: null,
        backend: 'claude',
        max_turns: null,
        base_strategy_id: 'base_s1',
      }),
    )
  })
})
