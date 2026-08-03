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
    },
  }
})

import { api } from '../../api/client'
import type { AgentBackendsResponse, JobSummary } from '../../api/types'
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
  enabled: true,
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
  vi.mocked(api.getAgentBackends).mockReset()
  vi.mocked(api.createAgentJob).mockReset()
  vi.mocked(api.cancelJob).mockReset()
  vi.mocked(api.getJob).mockReset()
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
    vi.mocked(api.getAgentBackends).mockResolvedValue({ enabled: false, backends: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText(/localhost/)).toBeInTheDocument())
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  it('取得失敗（backends=null）のときも localhost 限定の案内を表示する（機能を落とさない縮退）', async () => {
    vi.mocked(api.getAgentBackends).mockRejectedValue(new Error('network error'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/localhost/)).toBeInTheDocument())
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
