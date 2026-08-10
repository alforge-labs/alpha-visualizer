import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useServerRestart } from '../useServerRestart'
import { api } from '../../api/client'

describe('useServerRestart', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.restoreAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('health が復帰したらリロードする', async () => {
    const reload = vi.fn()
    vi.spyOn(api, 'getHealth')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ status: 'ok' } as never)
    const { result } = renderHook(() => useServerRestart(reload))
    act(() => { result.current.begin() })
    expect(result.current.waiting).toBe(true)
    // waitFor は内部ポーリングも fake timers に乗ってしまい、advance を止めた
    // 後は永久に進まず固まる（useJobRunner.test.tsx の poll fallback 系テストと
    // 同じ理由で、advance 完了時点の状態を直接 assert する）。
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('上限まで復帰しなければ timedOut を立てる', async () => {
    // 無限スピナーにせず、手動再起動を案内できるようにする
    const reload = vi.fn()
    vi.spyOn(api, 'getHealth').mockRejectedValue(new Error('connection refused'))
    const { result } = renderHook(() => useServerRestart(reload))
    act(() => { result.current.begin() })
    await act(async () => { await vi.advanceTimersByTimeAsync(61000) })
    expect(result.current.timedOut).toBe(true)
    expect(reload).not.toHaveBeenCalled()
    expect(result.current.waiting).toBe(false)
  })
})
