import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => {
  // useSparklineCache が instanceof ApiError で 404 と障害を区別するため、
  // mock にも ApiError クラスを含める（欠けると分岐が通らない）
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
  return { ApiError, api: { getSparkline: vi.fn() } }
})

import { api, ApiError } from '../../api/client'
import { useSparklineCache } from '../useSparklineCache'

beforeEach(() => {
  vi.mocked(api.getSparkline)
    .mockReset()
    .mockResolvedValue({ run_id: 'run-1', values: [1, 2, 3] })
})

/**
 * 呼び出し側（StrategySlidePanel / StrategyTable）は prefetch を useEffect から呼び、
 * 戻り値そのものを依存配列に入れている。そのため本フックには 2 つの契約がある:
 *
 * 1. 戻り値の identity がレンダーごとに変わらないこと
 *    （変わると effect が毎レンダー発火し、fetch → setState → 再レンダー の無限ループになる）
 * 2. 重複ガードが React の更新キュー状態に依存しないこと
 *    （setEntries の updater は保留中の更新があると即時実行されないため、
 *      state を見るガードは同一戦略でも何度も fetch を通してしまう）
 *
 * どちらか一方でも崩れると uvicorn ログが同一 API 呼び出しで埋まる（実測 1.5 秒で約 7,700 回）。
 *
 * issue #387: 取得は「run 一覧 → 2MB 級フル詳細」の 2 連 fetch でなく、
 * 軽量 sparkline API 1 回に統一。エラーは 'empty'（データなし）に丸めず
 * 'error' として区別する。
 */
describe('useSparklineCache', () => {
  it('同じ戦略を連続 prefetch しても API 呼び出しは 1 回だけ', async () => {
    const { result } = renderHook(() => useSparklineCache())

    // 1 回目の setEntries が flush される前に 2 回目を呼ぶ（effect 由来の連続呼び出し相当）
    act(() => {
      result.current.prefetch('strat_a')
      result.current.prefetch('strat_a')
    })

    await waitFor(() => expect(result.current.entries['strat_a']).toEqual([1, 2, 3]))
    expect(api.getSparkline).toHaveBeenCalledTimes(1)
  })

  it('state が変わらない再レンダーでは戻り値の identity を保つ', () => {
    const { result, rerender } = renderHook(() => useSparklineCache())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('取得済みの戦略を再度 prefetch しても再フェッチしない', async () => {
    const { result } = renderHook(() => useSparklineCache())

    act(() => {
      result.current.prefetch('strat_a')
    })
    await waitFor(() => expect(result.current.entries['strat_a']).toEqual([1, 2, 3]))

    act(() => {
      result.current.prefetch('strat_a')
    })

    expect(api.getSparkline).toHaveBeenCalledTimes(1)
  })

  it('戦略ごとに個別に取得する', async () => {
    const { result } = renderHook(() => useSparklineCache())

    act(() => {
      result.current.prefetch('strat_a')
      result.current.prefetch('strat_b')
    })

    await waitFor(() => expect(api.getSparkline).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.getSparkline).mock.calls.map((c) => c[0])).toEqual([
      'strat_a',
      'strat_b',
    ])
  })

  it('404（データなし）は empty として扱う (issue #387)', async () => {
    vi.mocked(api.getSparkline).mockRejectedValue(
      new ApiError('API 404: {"detail":"not found"}', 404, '/api/strategies/x/sparkline'),
    )
    const { result } = renderHook(() => useSparklineCache())

    act(() => {
      result.current.prefetch('strat_a')
    })

    await waitFor(() => expect(result.current.entries['strat_a']).toBe('empty'))
  })

  it('ネットワーク/サーバーエラーは empty に丸めず error として区別する (issue #387)', async () => {
    vi.mocked(api.getSparkline).mockRejectedValue(new Error('Failed to fetch'))
    const { result } = renderHook(() => useSparklineCache())

    act(() => {
      result.current.prefetch('strat_a')
    })

    await waitFor(() => expect(result.current.entries['strat_a']).toBe('error'))
  })
})
