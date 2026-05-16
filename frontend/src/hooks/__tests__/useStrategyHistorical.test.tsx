import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../../api/client'
import type { HistoricalResponse } from '../../api/types'
import { useStrategyHistorical } from '../useStrategyHistorical'

describe('useStrategyHistorical', () => {
  const sample: HistoricalResponse = {
    symbol: 'SPY',
    interval: '1d',
    bars: [
      { time: '2025-01-02', open: 400, high: 405, low: 399, close: 403.5, volume: 1_000_000 },
    ],
  }

  let getHistoricalSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getHistoricalSpy = vi.spyOn(api, 'getHistorical')
  })

  afterEach(() => {
    getHistoricalSpy.mockRestore()
  })

  it('symbol が null のとき loading を返し fetcher は呼ばれない', () => {
    const { result } = renderHook(() => useStrategyHistorical(null))
    expect(result.current).toEqual({ status: 'loading' })
    expect(getHistoricalSpy).not.toHaveBeenCalled()
  })

  it('symbol が空文字のとき loading を返し fetcher は呼ばれない', () => {
    const { result } = renderHook(() => useStrategyHistorical(''))
    expect(result.current).toEqual({ status: 'loading' })
    expect(getHistoricalSpy).not.toHaveBeenCalled()
  })

  it('symbol 指定で getHistorical が symbol/interval=1d で呼ばれ ready になる', async () => {
    getHistoricalSpy.mockResolvedValueOnce(sample)

    const { result } = renderHook(() => useStrategyHistorical('SPY'))

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', data: sample, isMock: false })
    })
    expect(getHistoricalSpy).toHaveBeenCalledWith('SPY', '1d')
  })

  it('interval を渡すと fetcher にそのまま渡される', async () => {
    getHistoricalSpy.mockResolvedValueOnce({ ...sample, interval: '1h' })

    const { result } = renderHook(() => useStrategyHistorical('AAPL', '1h'))

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(getHistoricalSpy).toHaveBeenCalledWith('AAPL', '1h')
  })

  it('404 のとき no_data を返す', async () => {
    getHistoricalSpy.mockRejectedValueOnce(
      new ApiError('not found', 404, '/api/historical/SPY?interval=1d'),
    )

    const { result } = renderHook(() => useStrategyHistorical('SPY'))

    await waitFor(() => {
      expect(result.current.status).toBe('no_data')
    })
  })

  it('非 404 エラーは error 状態になる', async () => {
    getHistoricalSpy.mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useStrategyHistorical('SPY'))

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'error', error: 'network down' })
    })
  })

  it('interval が変わると再 fetch される', async () => {
    getHistoricalSpy.mockResolvedValue(sample)

    const { result, rerender } = renderHook(
      ({ interval }) => useStrategyHistorical('SPY', interval),
      { initialProps: { interval: '1d' } },
    )

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(getHistoricalSpy).toHaveBeenLastCalledWith('SPY', '1d')

    rerender({ interval: '1h' })

    await waitFor(() => {
      expect(getHistoricalSpy).toHaveBeenLastCalledWith('SPY', '1h')
    })
  })
})
