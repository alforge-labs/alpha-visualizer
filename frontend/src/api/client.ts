import type { BacktestDetail, IdeaItem, OptimizeResult, StrategyComparison, StrategyDetail, StrategyListItem, StrategyRun, WFOResult } from './types'

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

  getOptimize: (strategyId: string): Promise<OptimizeResult> =>
    request<OptimizeResult>(`/optimize/${encodeURIComponent(strategyId)}`),

  compareStrategies: (ids: string[]): Promise<StrategyComparison[]> =>
    request<StrategyComparison[]>(`/strategies/compare?ids=${encodeURIComponent(ids.join(','))}`),

  listStrategies: (): Promise<StrategyListItem[]> =>
    request<StrategyListItem[]>('/strategies'),

  // backend に専用 /runs エンドポイントが無いため、/strategies/{id} の results を整形して返す
  getStrategyRuns: async (strategyId: string): Promise<StrategyRun[]> => {
    interface StrategyResultRow {
      run_id?: string | null
      run_at?: string | null
      sharpe?: number | null
      return_pct?: number | null
      max_drawdown_pct?: number | null
    }
    interface StrategyDetailLite {
      results?: StrategyResultRow[]
    }
    const detail = await request<StrategyDetailLite>(
      `/strategies/${encodeURIComponent(strategyId)}`,
    )
    const rows = detail.results ?? []
    return rows
      .filter((r): r is StrategyResultRow & { run_id: string; run_at: string } =>
        typeof r.run_id === 'string' && r.run_id.length > 0
        && typeof r.run_at === 'string' && r.run_at.length > 0,
      )
      .map<StrategyRun>(r => ({
        run_id: r.run_id,
        run_at: r.run_at,
        sharpe_ratio: r.sharpe ?? null,
        total_return_pct: r.return_pct ?? null,
        max_drawdown_pct: r.max_drawdown_pct ?? null,
      }))
  },

  getStrategyDetail: (strategyId: string): Promise<StrategyDetail> =>
    request<StrategyDetail>(`/strategies/${encodeURIComponent(strategyId)}`),

  runBacktest: (strategyId: string, symbol: string, timeframe: string): Promise<{ run_id: string; status: string }> =>
    request<{ run_id: string; status: string }>('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_id: strategyId, symbol, timeframe }),
    }),

  listIdeas: (status?: string): Promise<IdeaItem[]> =>
    request<IdeaItem[]>(`/ideas${status ? `?status=${encodeURIComponent(status)}` : ''}`),

  getIdea: (ideaId: string): Promise<IdeaItem> =>
    request<IdeaItem>(`/ideas/${encodeURIComponent(ideaId)}`),
}

export { ApiError }
