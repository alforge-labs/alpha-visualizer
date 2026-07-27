import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOrphanRuns } from '../useOrphanRuns'
import type { OrphanRunItem, OrphanRunsResponse, PruneOrphansResponse } from '../../api/types'

vi.mock('../../api/client', () => ({
  api: {
    listOrphanRuns: vi.fn(),
    pruneOrphanRuns: vi.fn(),
  },
}))

import { api } from '../../api/client'

const ORPHANS: OrphanRunItem[] = [
  {
    strategy_id: 'lev_tmp',
    backtest_run_count: 20,
    optimization_run_count: 0,
    bytes: 5856500,
    first_run_at: '2026-06-08T14:05:30+00:00',
    last_run_at: '2026-06-08T14:07:20+00:00',
  },
  {
    strategy_id: 'a158_sma_base',
    backtest_run_count: 1,
    optimization_run_count: 2,
    bytes: 1024,
    first_run_at: '2026-05-11T00:00:00+00:00',
    last_run_at: '2026-05-12T00:00:00+00:00',
  },
]

const LIST_RESPONSE: OrphanRunsResponse = {
  orphans: ORPHANS,
  count: ORPHANS.length,
  total_bytes: 5857524,
}

const PRUNE_RESPONSE: PruneOrphansResponse = {
  deleted_strategy_ids: ['lev_tmp'],
  deleted_backtest_rows: 20,
  deleted_optimization_rows: 0,
  reclaimed_bytes: 5856500,
  vacuum_error: null,
}

beforeEach(() => {
  // toHaveBeenCalledTimes で呼び出し回数を厳密に検証するテストがあるため、
  // 前のテストの呼び出し履歴を必ずクリアする。
  vi.clearAllMocks()
  vi.mocked(api.listOrphanRuns).mockResolvedValue(LIST_RESPONSE)
  vi.mocked(api.pruneOrphanRuns).mockResolvedValue(PRUNE_RESPONSE)
})

describe('useOrphanRuns', () => {
  it('初期状態で一覧を取得し、orphans と totalBytes を持つ', async () => {
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(api.listOrphanRuns).toHaveBeenCalledTimes(1)
    expect(result.current.orphans).toEqual(ORPHANS)
    expect(result.current.totalBytes).toBe(5857524)
  })

  it('初期状態で selectedIds が空', async () => {
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.selectedIds).toEqual([])
  })

  it('toggleId で選択が付き外れする', async () => {
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.toggleId('lev_tmp'))
    expect(result.current.selectedIds).toEqual(['lev_tmp'])

    act(() => result.current.toggleId('lev_tmp'))
    expect(result.current.selectedIds).toEqual([])
  })

  it('selectAll で全件が選択され、clearSelection で空になる', async () => {
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.selectAll())
    expect(result.current.selectedIds).toEqual(['lev_tmp', 'a158_sma_base'])

    act(() => result.current.clearSelection())
    expect(result.current.selectedIds).toEqual([])
  })

  it('selectedIds が空のとき deleteSelected を呼んでも API を呼ばない', async () => {
    // forge は --strategy 省略時に全孤児を削除する。空呼び出しでの誤爆を
    // hook 側でも止める（backend の 400 に頼らない 2 段防御）。
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.selectedIds).toEqual([])
    await act(async () => {
      await result.current.deleteSelected()
    })

    expect(api.pruneOrphanRuns).not.toHaveBeenCalled()
    expect(result.current.result).toBeNull()
  })

  it('削除に成功したら一覧を取り直す', async () => {
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.toggleId('lev_tmp'))
    await act(async () => {
      await result.current.deleteSelected()
    })

    expect(api.pruneOrphanRuns).toHaveBeenCalledWith(['lev_tmp'])
    // 削除成功後に一覧を再取得する（初回 fetch + 削除後 fetch で 2 回）
    expect(api.listOrphanRuns).toHaveBeenCalledTimes(2)
    expect(result.current.result).toEqual({
      deletedCount: 1,
      deletedBacktestRows: 20,
      deletedOptimizationRows: 0,
      reclaimedBytes: 5856500,
      vacuumError: null,
    })
    expect(result.current.selectedIds).toEqual([])
  })

  it('削除に失敗したら error に入り、result は null のまま', async () => {
    vi.mocked(api.pruneOrphanRuns).mockRejectedValue(new Error('database is locked'))
    const { result } = renderHook(() => useOrphanRuns())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.toggleId('lev_tmp'))
    await act(async () => {
      await result.current.deleteSelected()
    })

    expect(result.current.error).toBe('database is locked')
    expect(result.current.result).toBeNull()
    // 失敗時は一覧を取り直さない（初回 fetch のみ）
    expect(api.listOrphanRuns).toHaveBeenCalledTimes(1)
  })
})
