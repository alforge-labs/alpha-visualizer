import { useCallback, useState } from 'react'
import { api } from '../api/client'
import type {
  BacktestDetail,
  OptimizeResult,
  StrategyComparison,
  StrategyDetail,
  StrategyRun,
  WFOResult,
} from '../api/types'
import { MOCK_BACKTEST, MOCK_OPTIMIZE, MOCK_STRATEGIES, MOCK_WFO } from '../mock/btData'
import { type LoadState, useFetchByKey } from './useFetchByKey'

// Vite が PROD ビルドで `false` に静的置換 → DCE で IS_DEV ガード内が削除され、
// `mock/btData` への参照がなくなり tree-shaking で PROD bundle から除外される。
const IS_DEV = import.meta.env.DEV

// PROD では null になり、Vite が tree-shake で MOCK_* を bundle から除外する
const MOCK_BACKTEST_FALLBACK: BacktestDetail | null = IS_DEV ? MOCK_BACKTEST : null
const MOCK_WFO_FALLBACK: WFOResult | null = IS_DEV ? MOCK_WFO : null
const MOCK_OPTIMIZE_FALLBACK: OptimizeResult | null = IS_DEV ? MOCK_OPTIMIZE : null
const MOCK_STRATEGIES_FALLBACK: StrategyComparison[] | null = IS_DEV ? MOCK_STRATEGIES : null

export type { LoadState }

interface UseBacktestParams {
  runId: string | null
  /** 値を変えると同じ runId のまま再フェッチする（issue #265 の状態保持リトライ） */
  reloadToken?: number
}

export function useBacktest({ runId, reloadToken }: UseBacktestParams): LoadState<BacktestDetail> {
  return useFetchByKey<BacktestDetail>(runId, api.getBacktest, {
    mockFallback: MOCK_BACKTEST_FALLBACK,
    reloadToken,
  })
}

export function useWFO(strategyId: string | null, reloadToken?: number): LoadState<WFOResult> {
  return useFetchByKey<WFOResult>(strategyId, api.getWFO, {
    mockFallback: MOCK_WFO_FALLBACK,
    reloadToken,
  })
}

export function useCompare(
  ids: string[] | null,
  reloadToken?: number,
): LoadState<StrategyComparison[]> {
  const idsKey = ids && ids.length > 0 ? ids.join(',') : null
  return useFetchByKey<StrategyComparison[]>(
    idsKey,
    (key) => api.compareStrategies(key.split(',')),
    { mockFallback: MOCK_STRATEGIES_FALLBACK, reloadToken },
  )
}

export function useOptimize(
  strategyId: string | null,
  reloadToken?: number,
): LoadState<OptimizeResult> {
  return useFetchByKey<OptimizeResult>(strategyId, api.getOptimize, {
    mockFallback: MOCK_OPTIMIZE_FALLBACK,
    reloadToken,
  })
}

export function useStrategyRuns(
  strategyId: string | null,
  reloadToken?: number,
): LoadState<StrategyRun[]> {
  const state = useFetchByKey<StrategyRun[]>(strategyId, api.getStrategyRuns, { reloadToken })
  if (!strategyId) return { status: 'ready', data: [], isMock: false }
  return state
}

export function useStrategyDetail(strategyId: string | null): LoadState<StrategyDetail> {
  const state = useFetchByKey<StrategyDetail>(strategyId, api.getStrategyDetail)
  if (!strategyId) return { status: 'error', error: 'strategy_id が指定されていません' }
  return state
}

export function useRunBacktest() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logTail, setLogTail] = useState<string | null>(null)

  const run = useCallback(async (strategyId: string, symbol: string): Promise<boolean> => {
    setRunning(true)
    setError(null)
    setLogTail(null)
    try {
      const result = await api.runBacktest(strategyId, symbol)
      setLogTail(result.log_tail)
      setRunning(false)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRunning(false)
      return false
    }
  }, [])

  return { run, running, error, logTail }
}
