import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { listLive: vi.fn() },
}))

import { api } from '../../api/client'
import type { LiveListItem } from '../../api/types'
import { useLiveAvailability } from '../useLiveAvailability'

const items = (overrides: Partial<LiveListItem>[] = []): LiveListItem[] =>
  overrides.map(
    (o) => ({ strategy_id: 'x', has_summary: true, ...o } as unknown as LiveListItem),
  )

beforeEach(() => {
  vi.mocked(api.listLive).mockReset()
})

/**
 * issue #265: api.listLive() の失敗を silent に setHasLive(false) していたため、
 * ライブタブ欠落の原因に気づけなかった。失敗を error として表面化させる。
 */
describe('useLiveAvailability (issue #265)', () => {
  it('reports hasLive=true when a matching summary exists', async () => {
    vi.mocked(api.listLive).mockResolvedValue(items([{ strategy_id: 'strat_a', has_summary: true }]))
    const { result } = renderHook(() => useLiveAvailability('strat_a'))
    await waitFor(() => expect(result.current.hasLive).toBe(true))
    expect(result.current.error).toBeNull()
  })

  it('reports hasLive=false (no error) when there is no match', async () => {
    vi.mocked(api.listLive).mockResolvedValue(items([{ strategy_id: 'other', has_summary: true }]))
    const { result } = renderHook(() => useLiveAvailability('strat_a'))
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.hasLive).toBe(false)
  })

  it('surfaces an error (not silent) when listLive rejects', async () => {
    vi.mocked(api.listLive).mockRejectedValue(new Error('Network down'))
    const { result } = renderHook(() => useLiveAvailability('strat_a'))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.hasLive).toBe(false)
    expect(result.current.error).toContain('Network down')
  })
})
