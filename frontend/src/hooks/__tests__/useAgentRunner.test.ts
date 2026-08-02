import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => {
  // useJobRunnerCore が instanceof ApiError で分岐するため mock にも含める
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
    api: { createAgentJob: vi.fn(), cancelJob: vi.fn(), getJob: vi.fn() },
  }
})

import { api } from '../../api/client'
import type { JobSummary } from '../../api/types'
import { useAgentRunner } from '../useJobRunner'

/** SSE をテスト内で駆動するための EventSource スタブ。 */
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

const summary = (overrides: Partial<JobSummary> = {}): JobSummary => ({
  job_id: 'job-agent-1',
  kind: 'agent',
  strategy_id: '',
  symbol: 'AAPL',
  status: 'queued',
  created_at: '2026-08-02T00:00:00Z',
  started_at: null,
  finished_at: null,
  error: null,
  ...overrides,
})

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.mocked(api.createAgentJob).mockReset()
  vi.mocked(api.cancelJob).mockReset()
  vi.mocked(api.getJob).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Task 9: useJobRunner を useJobRunnerCore に切り出し、作成 API を注入可能にした。
 * useAgentRunner は api.createAgentJob（POST /api/agent/jobs）を使う点だけが
 * useJobRunner と異なり、SSE 購読・キャンセルは既存の共通ロジックを再利用する。
 */
describe('useAgentRunner', () => {
  it('start が api.createAgentJob を呼び SSE 購読を開始する', async () => {
    vi.mocked(api.createAgentJob).mockResolvedValue(summary())
    const { result } = renderHook(() => useAgentRunner())

    await act(async () => {
      await result.current.start({ goal: '目標', backend: 'claude' })
    })

    expect(api.createAgentJob).toHaveBeenCalledWith({ goal: '目標', backend: 'claude' })
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]!.url).toBe('/api/jobs/job-agent-1/events')
    expect(result.current.running).toBe(true)
  })

  it('SSE の status イベントで finish し onFinished を呼ぶ', async () => {
    vi.mocked(api.createAgentJob).mockResolvedValue(summary())
    const onFinished = vi.fn()
    const { result } = renderHook(() => useAgentRunner(onFinished))

    await act(async () => {
      await result.current.start({ goal: '目標', symbol: 'AAPL', backend: 'codex' })
    })
    const es = FakeEventSource.instances[0]!

    act(() => {
      es.emit({ type: 'status', status: 'succeeded', result: { summary: 'ok' }, error: null })
    })

    await waitFor(() => expect(result.current.status).toBe('succeeded'))
    expect(result.current.running).toBe(false)
    expect(result.current.result).toEqual({ summary: 'ok' })
    expect(es.closed).toBe(true)
    expect(onFinished).toHaveBeenCalledWith('succeeded')
  })

  it('createAgentJob の失敗を error として表面化し running を止める', async () => {
    vi.mocked(api.createAgentJob).mockRejectedValue(new Error('backend not available'))
    const { result } = renderHook(() => useAgentRunner())

    let ok = true
    await act(async () => {
      ok = await result.current.start({ goal: '目標', backend: 'claude' })
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe('backend not available')
    expect(result.current.running).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(0)
  })
})
