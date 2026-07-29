import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { getStrategyRuns: vi.fn(), getBacktest: vi.fn() },
}))

import { api } from '../../api/client'
import type { BacktestDetail, StrategyRun } from '../../api/types'
import { useSparklineCache } from '../useSparklineCache'

const RUN = {
  run_id: 'run-1',
  run_at: '2026-07-01T00:00:00',
  sharpe_ratio: 1.2,
  total_return_pct: 10,
  max_drawdown_pct: -5,
  source: null,
} as unknown as StrategyRun

const DETAIL = { equity: { values: [1, 2, 3] } } as unknown as BacktestDetail

beforeEach(() => {
  vi.mocked(api.getStrategyRuns).mockReset().mockResolvedValue([RUN])
  vi.mocked(api.getBacktest).mockReset().mockResolvedValue(DETAIL)
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
    expect(api.getStrategyRuns).toHaveBeenCalledTimes(1)
    expect(api.getBacktest).toHaveBeenCalledTimes(1)
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

    expect(api.getStrategyRuns).toHaveBeenCalledTimes(1)
  })

  it('戦略ごとに個別に取得する', async () => {
    const { result } = renderHook(() => useSparklineCache())

    act(() => {
      result.current.prefetch('strat_a')
      result.current.prefetch('strat_b')
    })

    await waitFor(() => expect(api.getStrategyRuns).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.getStrategyRuns).mock.calls.map((c) => c[0])).toEqual([
      'strat_a',
      'strat_b',
    ])
  })
})
