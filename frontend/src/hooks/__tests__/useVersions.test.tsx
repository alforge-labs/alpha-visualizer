import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useVersions } from '../useVersions'
import { api } from '../../api/client'

describe('useVersions', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('マウント時に取得して components を返す', async () => {
    vi.spyOn(api, 'getVersions').mockResolvedValue({
      components: [
        { id: 'forge', status: 'ok', current: '1.9.2', latest: '1.9.3', update_available: true, updatable: true, message: null, as_of: null },
      ],
    })
    const { result } = renderHook(() => useVersions())
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    expect(result.current.components).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('取得失敗は error に入れて loading を解除する', async () => {
    vi.spyOn(api, 'getVersions').mockRejectedValue(new Error('API 503: forge cli not found'))
    const { result } = renderHook(() => useVersions())
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    expect(result.current.error).toContain('503')
    expect(result.current.components).toEqual([])
  })
})
