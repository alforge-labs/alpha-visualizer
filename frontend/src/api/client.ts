import type { BacktestDetail, StrategyComparison, StrategyListItem, StrategyRun, WFOResult } from './types'

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

  listStrategies: (): Promise<StrategyListItem[]> =>
    request<StrategyListItem[]>('/strategies'),

  getStrategyRuns: (strategyId: string): Promise<StrategyRun[]> =>
    request<StrategyRun[]>(`/strategies/${encodeURIComponent(strategyId)}/runs`),

  runBacktest: (strategyId: string, symbol: string, timeframe: string): Promise<{ run_id: string; status: string }> =>
    request<{ run_id: string; status: string }>('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_id: strategyId, symbol, timeframe }),
    }),
}

export { ApiError }
