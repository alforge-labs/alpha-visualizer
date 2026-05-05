import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { StrategyListItem } from '../api/types'

export type SortKey = 'name' | 'latest_sharpe' | 'latest_return_pct' | 'latest_max_drawdown_pct' | 'latest_profit_factor' | 'latest_win_rate_pct' | 'last_run_at'
export type SortDir = 'asc' | 'desc'

const VALID_SORT_KEYS: readonly SortKey[] = [
  'name', 'latest_sharpe', 'latest_return_pct', 'latest_max_drawdown_pct',
  'latest_profit_factor', 'latest_win_rate_pct', 'last_run_at',
] as const

function toSortKey(v: string | null): SortKey {
  return (VALID_SORT_KEYS as readonly string[]).includes(v ?? '') ? (v as SortKey) : 'latest_sharpe'
}

function toSortDir(v: string | null): SortDir {
  return v === 'asc' || v === 'desc' ? v : 'desc'
}

export interface StrategyListState {
  all: StrategyListItem[]
  filtered: StrategyListItem[]
  loading: boolean
  error: string | null
  sortKey: SortKey
  sortDir: SortDir
  setSort: (key: SortKey) => void
  symbols: string[]
  timeframes: string[]
}

function numVal(v: number | null): number {
  return v ?? -Infinity
}

export function useStrategyList(): StrategyListState {
  const [searchParams, setSearchParams] = useSearchParams()
  const [all, setAll] = useState<StrategyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sortKey = toSortKey(searchParams.get('sort'))
  const sortDir = toSortDir(searchParams.get('dir'))
  const q = searchParams.get('q') ?? ''
  const symbolParam = searchParams.get('symbol') ?? ''
  const tfParam = searchParams.get('tf') ?? ''

  const symbolFilter = useMemo(() => symbolParam.split(',').filter(Boolean), [symbolParam])
  const tfFilter = useMemo(() => tfParam.split(',').filter(Boolean), [tfParam])
  const sharpeMin = parseFloat(searchParams.get('sharpe_min') ?? '')
  const ddMax = parseFloat(searchParams.get('dd_max') ?? '')

  useEffect(() => {
    let cancelled = false
    api.listStrategies()
      .then(data => {
        if (cancelled) return
        setAll(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const symbols = useMemo(() => [...new Set(all.map(s => s.symbol).filter(Boolean) as string[])].sort(), [all])
  const timeframes = useMemo(() => [...new Set(all.map(s => s.timeframe).filter(Boolean) as string[])].sort(), [all])

  const filtered = useMemo(() => {
    let items = all.filter(s => {
      if (q && !s.name.toLowerCase().includes(q.toLowerCase()) && !(s.symbol ?? '').toLowerCase().includes(q.toLowerCase())) return false
      if (symbolFilter.length > 0 && !symbolFilter.includes(s.symbol ?? '')) return false
      if (tfFilter.length > 0 && !tfFilter.includes(s.timeframe ?? '')) return false
      if (!isNaN(sharpeMin) && numVal(s.latest_sharpe) < sharpeMin) return false
      if (!isNaN(ddMax) && Math.abs(numVal(s.latest_max_drawdown_pct)) > ddMax) return false
      return true
    })

    items = [...items].sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'last_run_at') { va = a.last_run_at ?? ''; vb = b.last_run_at ?? '' }
      else { va = numVal(a[sortKey] as number | null); vb = numVal(b[sortKey] as number | null) }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return items
  }, [all, q, symbolParam, tfParam, sharpeMin, ddMax, sortKey, sortDir])

  const setSort = (key: SortKey) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (next.get('sort') === key) {
        next.set('dir', next.get('dir') === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sort', key)
        next.set('dir', 'desc')
      }
      return next
    }, { replace: true })
  }

  return { all, filtered, loading, error, sortKey, sortDir, setSort, symbols, timeframes }
}
