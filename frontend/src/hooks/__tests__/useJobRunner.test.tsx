import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => {
  // useJobRunner が instanceof ApiError で分岐するため mock にも含める
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
    api: { createJob: vi.fn(), cancelJob: vi.fn(), getJob: vi.fn() },
  }
})

import { api, ApiError } from '../../api/client'
import type { JobSummary } from '../../api/types'
import { useJobRunner, JOB_STATE_LOST_ERROR } from '../useJobRunner'

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
  job_id: 'job-1',
  kind: 'optimize',
  strategy_id: 's1',
  symbol: 'AAPL',
  status: 'queued',
  created_at: '2026-07-17T00:00:00Z',
  started_at: null,
  finished_at: null,
  error: null,
  ...overrides,
})

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.mocked(api.createJob).mockReset()
  vi.mocked(api.cancelJob).mockReset()
  vi.mocked(api.getJob).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * issue #292 (GUI化 Wave B): optimize / WFT は分〜時間単位かかるため、
 * ジョブ作成 → SSE 進捗購読 → 終了通知（onFinished）のループを 1 つの
 * フックに閉じ込め、UI はこの状態を描画するだけにする。
 */
describe('useJobRunner (issue #292)', () => {
  it('creates a job and subscribes to its SSE stream', async () => {
    vi.mocked(api.createJob).mockResolvedValue(summary())
    const { result } = renderHook(() => useJobRunner())

    await act(async () => {
      await result.current.start({ kind: 'optimize', strategy_id: 's1', symbol: 'AAPL', trials: 30 })
    })

    expect(api.createJob).toHaveBeenCalledWith({
      kind: 'optimize', strategy_id: 's1', symbol: 'AAPL', trials: 30,
    })
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]!.url).toBe('/api/jobs/job-1/events')
    expect(result.current.running).toBe(true)
  })

  it('applies snapshot, appends log lines, and finishes on status event', async () => {
    vi.mocked(api.createJob).mockResolvedValue(summary())
    const onFinished = vi.fn()
    const { result } = renderHook(() => useJobRunner(onFinished))

    await act(async () => {
      await result.current.start({ kind: 'optimize', strategy_id: 's1', symbol: 'AAPL' })
    })
    const es = FakeEventSource.instances[0]!

    act(() => {
      es.emit({ type: 'snapshot', status: 'running', lines: ['trial 1'], seq: 1 })
      es.emit({ type: 'log', lines: ['trial 2'], seq: 2 })
    })
    await waitFor(() => {
      expect(result.current.logLines).toEqual(['trial 1', 'trial 2'])
    })
    expect(result.current.status).toBe('running')

    act(() => {
      es.emit({
        type: 'status',
        status: 'succeeded',
        result: { best_value: 1.9 },
        error: null,
      })
    })
    await waitFor(() => expect(result.current.status).toBe('succeeded'))
    expect(result.current.running).toBe(false)
    expect(result.current.result).toEqual({ best_value: 1.9 })
    expect(es.closed).toBe(true)
    expect(onFinished).toHaveBeenCalledWith('succeeded')
  })

  it('cancel() calls the cancel API for the active job', async () => {
    vi.mocked(api.createJob).mockResolvedValue(summary())
    vi.mocked(api.cancelJob).mockResolvedValue(summary({ status: 'cancelled' }))
    const { result } = renderHook(() => useJobRunner())

    await act(async () => {
      await result.current.start({ kind: 'wft', strategy_id: 's1', symbol: 'AAPL', windows: 5 })
    })
    await act(async () => {
      await result.current.cancel()
    })

    expect(api.cancelJob).toHaveBeenCalledWith('job-1')
  })

  it('surfaces createJob failure as error and stops running', async () => {
    vi.mocked(api.createJob).mockRejectedValue(new Error('forge not found'))
    const { result } = renderHook(() => useJobRunner())

    let ok = true
    await act(async () => {
      ok = await result.current.start({ kind: 'optimize', strategy_id: 's1', symbol: 'AAPL' })
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe('forge not found')
    expect(result.current.running).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('closes the stream on unmount', async () => {
    vi.mocked(api.createJob).mockResolvedValue(summary())
    const { result, unmount } = renderHook(() => useJobRunner())
    await act(async () => {
      await result.current.start({ kind: 'optimize', strategy_id: 's1', symbol: 'AAPL' })
    })

    unmount()
    expect(FakeEventSource.instances[0]!.closed).toBe(true)
  })
})


/**
 * issue #355: ジョブ状態は in-process 保持のためサーバー再起動で消える。
 * ポーリングフォールバック中の 404 は恒久的なのに、catch が空で
 * running=true のまま 3 秒毎のリクエストを無期限に発行し続けていた。
 * 404 は即打ち切り、その他エラーも連続 N 回で断念する。
 */
describe('useJobRunner poll fallback error handling (issue #355)', () => {
  async function startAndFallbackToPolling() {
    vi.mocked(api.createJob).mockResolvedValue(summary())
    const { result } = renderHook(() => useJobRunner())
    await act(async () => {
      await result.current.start({ kind: 'optimize', strategy_id: 's1', symbol: 'AAPL' })
    })
    const es = FakeEventSource.instances[0]!
    act(() => {
      es.onerror?.()
    })
    return result
  }

  it('stops immediately and marks failed when polling hits 404', async () => {
    vi.useFakeTimers()
    try {
      const result = await startAndFallbackToPolling()
      vi.mocked(api.getJob).mockRejectedValue(
        new ApiError('API 404: {"detail":"Not Found"}', 404, '/api/jobs/job-1'),
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(result.current.running).toBe(false)
      expect(result.current.status).toBe('failed')
      expect(result.current.error).toBe(JOB_STATE_LOST_ERROR)
      // 打ち切り後はポーリングを発行しない
      const calls = vi.mocked(api.getJob).mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000)
      })
      expect(vi.mocked(api.getJob).mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up after 5 consecutive non-404 failures', async () => {
    vi.useFakeTimers()
    try {
      const result = await startAndFallbackToPolling()
      vi.mocked(api.getJob).mockRejectedValue(new Error('Failed to fetch'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000 * 5)
      })
      expect(result.current.running).toBe(false)
      expect(result.current.status).toBe('failed')
      expect(result.current.error).toBe(JOB_STATE_LOST_ERROR)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps polling through transient failures', async () => {
    vi.useFakeTimers()
    try {
      const result = await startAndFallbackToPolling()
      vi.mocked(api.getJob)
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValue({
          ...summary({ status: 'running' }),
          log_tail: '',
          result: null,
        } as never)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000 * 4)
      })
      // 一時的な失敗（連続上限未満）では諦めない
      expect(result.current.running).toBe(true)
      expect(result.current.status).toBe('running')
    } finally {
      vi.useRealTimers()
    }
  })
})
