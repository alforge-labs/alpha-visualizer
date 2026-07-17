import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { runBacktest: vi.fn() },
}))

import { api } from '../../api/client'
import { useRunBacktest } from '../useBacktestData'

beforeEach(() => {
  vi.mocked(api.runBacktest).mockReset()
})

/**
 * issue #291 (GUI化 Wave A): timeframe は戦略定義由来で CLI に渡すフラグが
 * 存在しないため API から除去し、代わりに実行ログ末尾（log_tail）を受け取って
 * UI で確認できるようにする。
 */
describe('useRunBacktest (issue #291)', () => {
  it('posts strategy_id and symbol only (no timeframe)', async () => {
    vi.mocked(api.runBacktest).mockResolvedValue({
      run_id: 'run-1',
      status: 'ok',
      log_tail: null,
    })
    const { result } = renderHook(() => useRunBacktest())

    let success = false
    await act(async () => {
      success = await result.current.run('strat_a', 'AAPL')
    })

    expect(success).toBe(true)
    expect(api.runBacktest).toHaveBeenCalledWith('strat_a', 'AAPL')
  })

  it('exposes log_tail from the response', async () => {
    vi.mocked(api.runBacktest).mockResolvedValue({
      run_id: 'run-1',
      status: 'ok',
      log_tail: 'Fetching data...\nBacktest done.',
    })
    const { result } = renderHook(() => useRunBacktest())

    await act(async () => {
      await result.current.run('strat_a', 'AAPL')
    })

    await waitFor(() => {
      expect(result.current.logTail).toBe('Fetching data...\nBacktest done.')
    })
    expect(result.current.error).toBeNull()
  })

  it('clears previous logTail when a new run starts', async () => {
    vi.mocked(api.runBacktest).mockResolvedValue({
      run_id: 'run-1',
      status: 'ok',
      log_tail: 'first log',
    })
    const { result } = renderHook(() => useRunBacktest())
    await act(async () => {
      await result.current.run('strat_a', 'AAPL')
    })
    await waitFor(() => expect(result.current.logTail).toBe('first log'))

    // 2 回目は失敗させ、古いログが残らないことを確認する
    vi.mocked(api.runBacktest).mockRejectedValue(new Error('boom'))
    await act(async () => {
      await result.current.run('strat_a', 'AAPL')
    })
    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.logTail).toBeNull()
  })

  it('surfaces error message and returns false on failure', async () => {
    vi.mocked(api.runBacktest).mockRejectedValue(new Error('forge not found'))
    const { result } = renderHook(() => useRunBacktest())

    let success = true
    await act(async () => {
      success = await result.current.run('strat_a', 'AAPL')
    })

    expect(success).toBe(false)
    await waitFor(() => expect(result.current.error).toBe('forge not found'))
    expect(result.current.running).toBe(false)
  })
})
