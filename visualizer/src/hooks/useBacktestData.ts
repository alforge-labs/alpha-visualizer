import { useEffect, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { BacktestDetail, StrategyComparison, WFOResult } from '../api/types'
import { MOCK_BACKTEST, MOCK_STRATEGIES, MOCK_WFO } from '../mock/btData'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; isMock: boolean }
  | { status: 'error'; error: string }

interface UseBacktestParams {
  runId: string | null
}

export function useBacktest({ runId }: UseBacktestParams): LoadState<BacktestDetail> {
  const [state, setState] = useState<LoadState<BacktestDetail>>({ status: 'loading' })

  useEffect(() => {
    if (!runId) {
      setState({ status: 'ready', data: MOCK_BACKTEST, isMock: true })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    api
      .getBacktest(runId)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, isMock: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'ready', data: MOCK_BACKTEST, isMock: true })
          return
        }
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  return state
}

export function useWFO(strategyId: string | null): LoadState<WFOResult> {
  const [state, setState] = useState<LoadState<WFOResult>>({ status: 'loading' })

  useEffect(() => {
    if (!strategyId) {
      setState({ status: 'ready', data: MOCK_WFO, isMock: true })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    api
      .getWFO(strategyId)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, isMock: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'ready', data: MOCK_WFO, isMock: true })
          return
        }
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [strategyId])

  return state
}

export function useCompare(ids: string[] | null): LoadState<StrategyComparison[]> {
  const [state, setState] = useState<LoadState<StrategyComparison[]>>({ status: 'loading' })

  useEffect(() => {
    if (!ids || ids.length === 0) {
      setState({ status: 'ready', data: MOCK_STRATEGIES, isMock: true })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    api
      .compareStrategies(ids)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, isMock: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'ready', data: MOCK_STRATEGIES, isMock: true })
          return
        }
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [ids])

  return state
}
