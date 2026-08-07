import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useLiveList } from '../useLiveList'
import { api } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: { listLive: vi.fn() },
}))

describe('useLiveList', () => {
  beforeEach(() => {
    // vi.mocked(...).mockResolvedValue はテスト間で持ち越されるため毎回明示再設定する
    vi.mocked(api.listLive).mockReset()
  })

  it('一覧を取得して返す', async () => {
    vi.mocked(api.listLive).mockResolvedValue([
      { strategy_id: 'pf_1', has_summary: true, has_trades: false, kind: 'position' },
    ])
    const { result } = renderHook(() => useLiveList())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
  })

  it('reload で再取得する', async () => {
    vi.mocked(api.listLive).mockResolvedValue([])
    const { result } = renderHook(() => useLiveList())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(api.listLive).mockResolvedValue([
      { strategy_id: 'pf_1', has_summary: true, has_trades: false, kind: 'position' },
    ])
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(vi.mocked(api.listLive)).toHaveBeenCalledTimes(2)
  })

  it('reload 成功時に前回の error をクリアする', async () => {
    vi.mocked(api.listLive).mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useLiveList())
    await waitFor(() => expect(result.current.error).toBe('network error'))

    vi.mocked(api.listLive).mockResolvedValue([
      { strategy_id: 'pf_1', has_summary: true, has_trades: false, kind: 'position' },
    ])
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })
})
