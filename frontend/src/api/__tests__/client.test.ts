import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../client'
import type { HistoricalResponse } from '../types'

/**
 * `api.getHistorical` の URL 構築と response handling を検証する。
 * fetch を vi.spyOn で乗っ取り、呼び出し URL と返却値を直接アサートする。
 */
describe('api.getHistorical', () => {
  const sampleResponse: HistoricalResponse = {
    symbol: 'SPY',
    interval: '1d',
    bars: [
      { time: '2025-01-02', open: 400, high: 405, low: 399, close: 403.5, volume: 1_000_000 },
    ],
  }

  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  function mockJsonResponse(body: unknown, status = 200): void {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }

  it('既定 interval=1d で /api/historical/{symbol}?interval=1d を呼ぶ', async () => {
    mockJsonResponse(sampleResponse)

    const result = await api.getHistorical('SPY')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toBe('/api/historical/SPY?interval=1d')
    expect(result).toEqual(sampleResponse)
  })

  it('interval を指定するとクエリに反映される', async () => {
    mockJsonResponse(sampleResponse)

    await api.getHistorical('AAPL', '1h')

    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toBe('/api/historical/AAPL?interval=1h')
  })

  it('range の start/end がクエリに乗る', async () => {
    mockJsonResponse(sampleResponse)

    await api.getHistorical('SPY', '1d', { start: '2024-01-02', end: '2024-03-25' })

    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toBe(
      '/api/historical/SPY?interval=1d&start=2024-01-02&end=2024-03-25',
    )
  })

  it('range の start のみでも end が無ければ start のみ乗る', async () => {
    mockJsonResponse(sampleResponse)

    await api.getHistorical('SPY', '1d', { start: '2024-01-02' })

    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toBe('/api/historical/SPY?interval=1d&start=2024-01-02')
  })

  it('symbol に special 文字が含まれていれば encode される', async () => {
    mockJsonResponse(sampleResponse)

    await api.getHistorical('CL=F')

    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toBe('/api/historical/CL%3DF?interval=1d')
  })

  it('404 のとき ApiError を throw する', async () => {
    mockJsonResponse({ detail: 'not found' }, 404)

    const err = await api.getHistorical('UNKNOWN').then(
      () => {
        throw new Error('expected getHistorical to reject')
      },
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 404,
      url: '/api/historical/UNKNOWN?interval=1d',
    })
  })
})
