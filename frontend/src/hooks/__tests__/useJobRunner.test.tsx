import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { createJob: vi.fn(), cancelJob: vi.fn(), getJob: vi.fn() },
}))

import { api } from '../../api/client'
import type { JobSummary } from '../../api/types'
import { useJobRunner } from '../useJobRunner'

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
