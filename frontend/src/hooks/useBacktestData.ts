import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { BacktestDetail, OptimizeResult, StrategyComparison, StrategyDetail, StrategyRun, WFOResult } from '../api/types'
import { MOCK_BACKTEST, MOCK_OPTIMIZE, MOCK_STRATEGIES, MOCK_WFO } from '../mock/btData'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; isMock: boolean }
  | { status: 'error'; error: string }

type FetchedState<T> =
  | { status: 'ready'; data: T; isMock: boolean }
  | { status: 'error'; error: string }

interface UseBacktestParams {
  runId: string | null
}

export function useBacktest({ runId }: UseBacktestParams): LoadState<BacktestDetail> {
  const [result, setResult] = useState<{ forId: string; state: FetchedState<BacktestDetail> } | null>(null)

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    api
      .getBacktest(runId)
      .then((data) => {
        if (!cancelled) setResult({ forId: runId, state: { status: 'ready', data, isMock: false } })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const state: FetchedState<BacktestDetail> =
          err instanceof ApiError && err.status === 404
            ? { status: 'ready', data: MOCK_BACKTEST, isMock: true }
            : { status: 'error', error: err instanceof Error ? err.message : String(err) }
        setResult({ forId: runId, state })
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  if (!runId) return { status: 'ready', data: MOCK_BACKTEST, isMock: true }
  if (result?.forId === runId) return result.state
  return { status: 'loading' }
}

export function useWFO(strategyId: string | null): LoadState<WFOResult> {
  const [result, setResult] = useState<{ forId: string; state: FetchedState<WFOResult> } | null>(null)

  useEffect(() => {
    if (!strategyId) return
    let cancelled = false
    api
      .getWFO(strategyId)
      .then((data) => {
        if (!cancelled) setResult({ forId: strategyId, state: { status: 'ready', data, isMock: false } })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const state: FetchedState<WFOResult> =
          err instanceof ApiError && err.status === 404
            ? { status: 'ready', data: MOCK_WFO, isMock: true }
            : { status: 'error', error: err instanceof Error ? err.message : String(err) }
        setResult({ forId: strategyId, state })
      })
    return () => {
      cancelled = true
    }
  }, [strategyId])

  if (!strategyId) return { status: 'ready', data: MOCK_WFO, isMock: true }
  if (result?.forId === strategyId) return result.state
  return { status: 'loading' }
}

export function useCompare(ids: string[] | null): LoadState<StrategyComparison[]> {
  const [result, setResult] = useState<{ forKey: string; state: FetchedState<StrategyComparison[]> } | null>(null)

  const idsKey = ids ? ids.join(',') : ''

  useEffect(() => {
    const currentIds = idsKey ? idsKey.split(',') : []
    if (currentIds.length === 0) return
    let cancelled = false
    api
      .compareStrategies(currentIds)
      .then((data) => {
        if (!cancelled) setResult({ forKey: idsKey, state: { status: 'ready', data, isMock: false } })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const state: FetchedState<StrategyComparison[]> =
          err instanceof ApiError && err.status === 404
            ? { status: 'ready', data: MOCK_STRATEGIES, isMock: true }
            : { status: 'error', error: err instanceof Error ? err.message : String(err) }
        setResult({ forKey: idsKey, state })
      })
    return () => {
      cancelled = true
    }
  }, [idsKey])

  if (!ids || ids.length === 0) return { status: 'ready', data: MOCK_STRATEGIES, isMock: true }
  if (result?.forKey === idsKey) return result.state
  return { status: 'loading' }
}

export function useOptimize(strategyId: string | null): LoadState<OptimizeResult> {
  const [result, setResult] = useState<{ forId: string; state: FetchedState<OptimizeResult> } | null>(null)

  useEffect(() => {
    if (!strategyId) return
    let cancelled = false
    api
      .getOptimize(strategyId)
      .then((data) => {
        if (!cancelled) setResult({ forId: strategyId, state: { status: 'ready', data, isMock: false } })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const state: FetchedState<OptimizeResult> =
          err instanceof ApiError && err.status === 404
            ? { status: 'ready', data: MOCK_OPTIMIZE, isMock: true }
            : { status: 'error', error: err instanceof Error ? err.message : String(err) }
        setResult({ forId: strategyId, state })
      })
    return () => {
      cancelled = true
    }
  }, [strategyId])

  if (!strategyId) return { status: 'ready', data: MOCK_OPTIMIZE, isMock: true }
  if (result?.forId === strategyId) return result.state
  return { status: 'loading' }
}

export function useStrategyRuns(strategyId: string | null): LoadState<StrategyRun[]> {
  const [result, setResult] = useState<{ forId: string; state: FetchedState<StrategyRun[]> } | null>(null)

  useEffect(() => {
    if (!strategyId) return
    let cancelled = false
    api.getStrategyRuns(strategyId)
      .then(data => {
        if (!cancelled) setResult({ forId: strategyId, state: { status: 'ready', data, isMock: false } })
      })
      .catch(err => {
        if (!cancelled) setResult({ forId: strategyId, state: { status: 'error', error: err instanceof Error ? err.message : String(err) } })
      })
    return () => { cancelled = true }
  }, [strategyId])

  if (!strategyId) return { status: 'ready', data: [], isMock: false }
  if (result?.forId === strategyId) return result.state
  return { status: 'loading' }
}

export function useStrategyDetail(strategyId: string | null): LoadState<StrategyDetail> {
  const [result, setResult] = useState<{ forId: string; state: FetchedState<StrategyDetail> } | null>(null)

  useEffect(() => {
    if (!strategyId) return
    let cancelled = false
    api.getStrategyDetail(strategyId)
      .then(data => {
        if (!cancelled) setResult({ forId: strategyId, state: { status: 'ready', data, isMock: false } })
      })
      .catch(err => {
        if (!cancelled) setResult({ forId: strategyId, state: { status: 'error', error: err instanceof Error ? err.message : String(err) } })
      })
    return () => { cancelled = true }
  }, [strategyId])

  if (!strategyId) return { status: 'error', error: 'strategy_id が指定されていません' }
  if (result?.forId === strategyId) return result.state
  return { status: 'loading' }
}

export function useRunBacktest() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (strategyId: string, symbol: string, timeframe: string): Promise<boolean> => {
    setRunning(true)
    setError(null)
    try {
      await api.runBacktest(strategyId, symbol, timeframe)
      setRunning(false)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRunning(false)
      return false
    }
  }, [])

  return { run, running, error }
}
