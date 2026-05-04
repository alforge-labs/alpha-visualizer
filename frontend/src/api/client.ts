import type { BacktestDetail, StrategyComparison, WFOResult } from './types'

const API_BASE = '/api'

class ApiError extends Error {
  readonly status: number
  readonly url: string
  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(`API ${res.status}: ${text || res.statusText}`, res.status, url)
  }
  return (await res.json()) as T
}

export const api = {
  getBacktest: (runId: string): Promise<BacktestDetail> =>
    request<BacktestDetail>(`/results/${encodeURIComponent(runId)}`),

  getWFO: (strategyId: string): Promise<WFOResult> =>
    request<WFOResult>(`/wfo/${encodeURIComponent(strategyId)}`),

  compareStrategies: (ids: string[]): Promise<StrategyComparison[]> =>
    request<StrategyComparison[]>(`/strategies/compare?ids=${encodeURIComponent(ids.join(','))}`),
}

export { ApiError }
