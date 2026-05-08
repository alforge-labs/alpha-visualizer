import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { useFetchByKey } from '../useFetchByKey'

describe('useFetchByKey', () => {
  it('returns loading when key is null and no mockFallback', () => {
    const fetcher = vi.fn()
    const { result } = renderHook(() => useFetchByKey<string>(null, fetcher))
    expect(result.current).toEqual({ status: 'loading' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns mock when key is null and mockFallback provided (DEV)', () => {
    const fetcher = vi.fn()
    const { result } = renderHook(() =>
      useFetchByKey<string>(null, fetcher, { mockFallback: 'mock-data' }),
    )
    // import.meta.env.DEV は vitest 環境で true
    expect(result.current).toEqual({ status: 'ready', data: 'mock-data', isMock: true })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('starts in loading state when key is provided', () => {
    const fetcher = vi.fn(async () => 'data')
    const { result } = renderHook(() => useFetchByKey<string>('key1', fetcher))
    expect(result.current).toEqual({ status: 'loading' })
  })

  it('resolves to ready when fetch succeeds', async () => {
    const fetcher = vi.fn(async (k: string) => `data-${k}`)
    const { result } = renderHook(() => useFetchByKey<string>('key1', fetcher))

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', data: 'data-key1', isMock: false })
    })
    expect(fetcher).toHaveBeenCalledWith('key1')
  })

  it('falls back to mock on 404 (DEV)', async () => {
    const fetcher = vi.fn(async () => {
      throw new ApiError('not found', 404, '/api/test')
    })
    const { result } = renderHook(() =>
      useFetchByKey<string>('key1', fetcher, { mockFallback: 'mock-data' }),
    )

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', data: 'mock-data', isMock: true })
    })
  })

  it('returns no_data on 404 without mockFallback', async () => {
    // 404 はリソース不在を意味し、生のエラー文字列を表示するのではなく
    // UI 側で「データなし」として扱える 'no_data' 状態にする。
    const fetcher = vi.fn(async () => {
      throw new ApiError('not found', 404, '/api/test')
    })
    const { result } = renderHook(() => useFetchByKey<string>('key1', fetcher))

    await waitFor(() => {
      expect(result.current.status).toBe('no_data')
    })
  })

  it('returns error on non-404 error', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('boom')
    })
    const { result } = renderHook(() =>
      useFetchByKey<string>('key1', fetcher, { mockFallback: 'mock-data' }),
    )

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'error', error: 'boom' })
    })
  })

  it('refetches when key changes', async () => {
    const fetcher = vi.fn(async (k: string) => `data-${k}`)
    const { result, rerender } = renderHook(
      ({ key }) => useFetchByKey<string>(key, fetcher),
      { initialProps: { key: 'key1' as string } },
    )

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', data: 'data-key1', isMock: false })
    })

    rerender({ key: 'key2' })
    // After rerender, transient loading state is OK (new key fires fresh useEffect)
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', data: 'data-key2', isMock: false })
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
