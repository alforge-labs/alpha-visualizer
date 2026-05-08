import { useEffect, useMemo, useState } from 'react'
import { type SetURLSearchParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { StrategyListItem } from '../api/types'
import { updateParam } from '../lib/searchParams'

export type SortKey = 'name' | 'latest_sharpe' | 'latest_return_pct' | 'latest_max_drawdown_pct' | 'latest_profit_factor' | 'latest_win_rate_pct' | 'last_run_at'
export type SortDir = 'asc' | 'desc'
export type GroupBy = 'none' | 'symbol' | 'tf' | 'tier'

const VALID_SORT_KEYS: readonly SortKey[] = [
  'name', 'latest_sharpe', 'latest_return_pct', 'latest_max_drawdown_pct',
  'latest_profit_factor', 'latest_win_rate_pct', 'last_run_at',
] as const

const VALID_GROUP_BY: readonly GroupBy[] = ['none', 'symbol', 'tf', 'tier'] as const

export const COMPARE_MAX = 6

function toSortKey(v: string | null): SortKey {
  return (VALID_SORT_KEYS as readonly string[]).includes(v ?? '') ? (v as SortKey) : 'latest_sharpe'
}

function toSortDir(v: string | null): SortDir {
  return v === 'asc' || v === 'desc' ? v : 'desc'
}

function toGroupBy(v: string | null): GroupBy {
  return (VALID_GROUP_BY as readonly string[]).includes(v ?? '') ? (v as GroupBy) : 'none'
}

function toSelectedId(v: string | null): string | null {
  return v && v.length > 0 ? v : null
}

function parseCompareList(v: string | null): string[] {
  if (!v) return []
  return v.split(',').map(s => s.trim()).filter(Boolean).slice(0, COMPARE_MAX)
}

export interface GroupAggregate {
  count: number
  bestSharpe: number | null
  worstDrawdownPct: number | null
}

export interface StrategyGroup {
  key: string
  label: string
  rank: number
  items: StrategyListItem[]
  aggregate: GroupAggregate
}

export interface StrategyListState {
  all: StrategyListItem[]
  filtered: StrategyListItem[]
  groups: StrategyGroup[]
  loading: boolean
  error: string | null
  sortKey: SortKey
  sortDir: SortDir
  setSort: (key: SortKey) => void
  groupBy: GroupBy
  setGroupBy: (g: GroupBy) => void
  symbols: string[]
  timeframes: string[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  compareIds: string[]
  toggleCompareId: (id: string) => void
  removeCompareId: (id: string) => void
  clearCompareIds: () => void
}

function numVal(v: number | null | undefined): number {
  return v ?? -Infinity
}

type TierKey = 'strong' | 'moderate' | 'weak' | 'no_data'

const TIER_RANK: Record<TierKey, number> = {
  strong: 0, moderate: 1, weak: 2, no_data: 3,
}

const TIER_LABEL: Record<TierKey, string> = {
  strong: 'Strong (Sharpe ≥ 1.5)',
  moderate: 'Moderate (1.0 ≤ Sharpe < 1.5)',
  weak: 'Weak (Sharpe < 1.0)',
  no_data: 'No data',
}

function sharpeTierKey(v: number | null | undefined): TierKey {
  if (v == null) return 'no_data'
  if (v >= 1.5) return 'strong'
  if (v >= 1.0) return 'moderate'
  return 'weak'
}

function aggregate(items: StrategyListItem[]): GroupAggregate {
  let bestSharpe: number | null = null
  let worstDd: number | null = null
  for (const s of items) {
    if (s.latest_sharpe != null) {
      bestSharpe = bestSharpe == null ? s.latest_sharpe : Math.max(bestSharpe, s.latest_sharpe)
    }
    if (s.latest_max_drawdown_pct != null) {
      worstDd = worstDd == null ? s.latest_max_drawdown_pct : Math.min(worstDd, s.latest_max_drawdown_pct)
    }
  }
  return { count: items.length, bestSharpe, worstDrawdownPct: worstDd }
}

function buildGroups(items: StrategyListItem[], groupBy: GroupBy): StrategyGroup[] {
  if (groupBy === 'none') {
    if (items.length === 0) return []
    return [{ key: 'all', label: 'all', rank: 0, items, aggregate: aggregate(items) }]
  }

  if (groupBy === 'tier') {
    const buckets: Record<TierKey, StrategyListItem[]> = {
      strong: [], moderate: [], weak: [], no_data: [],
    }
    for (const s of items) {
      buckets[sharpeTierKey(s.latest_sharpe)].push(s)
    }
    const out: StrategyGroup[] = []
    for (const tierKey of Object.keys(buckets) as TierKey[]) {
      const tierItems = buckets[tierKey]
      if (tierItems.length === 0) continue
      out.push({
        key: `tier:${tierKey}`,
        label: TIER_LABEL[tierKey],
        rank: TIER_RANK[tierKey],
        items: tierItems,
        aggregate: aggregate(tierItems),
      })
    }
    return out.sort((a, b) => a.rank - b.rank)
  }

  // groupBy: 'symbol' | 'tf'
  const keyOf = (s: StrategyListItem): string =>
    groupBy === 'symbol' ? (s.symbol ?? '') : (s.timeframe ?? '')

  const map = new Map<string, StrategyListItem[]>()
  for (const s of items) {
    const k = keyOf(s)
    const arr = map.get(k)
    if (arr) arr.push(s)
    else map.set(k, [s])
  }
  const out: StrategyGroup[] = []
  for (const [k, groupItems] of map.entries()) {
    const isUnassigned = !k
    out.push({
      key: `${groupBy}:${k || '_unassigned'}`,
      label: isUnassigned ? 'Unassigned' : k,
      rank: isUnassigned ? Number.POSITIVE_INFINITY : 0,
      items: groupItems,
      aggregate: aggregate(groupItems),
    })
  }
  return out.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.aggregate.count !== b.aggregate.count) return b.aggregate.count - a.aggregate.count
    return a.label.localeCompare(b.label)
  })
}

// ----- Internal hooks -----

function useStrategyData(): {
  all: StrategyListItem[]
  loading: boolean
  error: string | null
  symbols: string[]
  timeframes: string[]
} {
  const [all, setAll] = useState<StrategyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const symbols = useMemo(
    () => [...new Set(all.map(s => s.symbol).filter(Boolean) as string[])].sort(),
    [all],
  )
  const timeframes = useMemo(
    () => [...new Set(all.map(s => s.timeframe).filter(Boolean) as string[])].sort(),
    [all],
  )

  return { all, loading, error, symbols, timeframes }
}


function useFiltering(
  all: StrategyListItem[],
  q: string,
  symbolFilter: string[],
  tfFilter: string[],
  sharpeMin: number,
  ddMax: number,
): StrategyListItem[] {
  return useMemo(() => {
    return all.filter(s => {
      if (q && !s.name.toLowerCase().includes(q.toLowerCase()) && !(s.symbol ?? '').toLowerCase().includes(q.toLowerCase())) return false
      if (symbolFilter.length > 0 && !symbolFilter.includes(s.symbol ?? '')) return false
      if (tfFilter.length > 0 && !tfFilter.includes(s.timeframe ?? '')) return false
      if (!isNaN(sharpeMin) && numVal(s.latest_sharpe) < sharpeMin) return false
      if (!isNaN(ddMax) && Math.abs(numVal(s.latest_max_drawdown_pct)) > ddMax) return false
      return true
    })
  }, [all, q, symbolFilter, tfFilter, sharpeMin, ddMax])
}


function useSortedItems(
  items: StrategyListItem[],
  sortKey: SortKey,
  sortDir: SortDir,
): StrategyListItem[] {
  return useMemo(() => {
    return [...items].sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'last_run_at') { va = a.last_run_at ?? ''; vb = b.last_run_at ?? '' }
      else { va = numVal(a[sortKey] as number | null); vb = numVal(b[sortKey] as number | null) }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [items, sortKey, sortDir])
}


function useGrouping(
  items: StrategyListItem[],
  groupBy: GroupBy,
): StrategyGroup[] {
  return useMemo(() => buildGroups(items, groupBy), [items, groupBy])
}


function useSelectedId(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
): { selectedId: string | null; setSelectedId: (id: string | null) => void } {
  const selectedId = toSelectedId(searchParams.get('selected'))
  const setSelectedId = (id: string | null): void => {
    setSearchParams(prev => updateParam(prev, 'selected', id), { replace: true })
  }
  return { selectedId, setSelectedId }
}


function useCompareSelection(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
): {
  compareIds: string[]
  toggleCompareId: (id: string) => void
  removeCompareId: (id: string) => void
  clearCompareIds: () => void
} {
  const compareIds = useMemo(
    () => parseCompareList(searchParams.get('compare')),
    [searchParams],
  )

  const writeCompare = (ids: string[]): string | null =>
    ids.length === 0 ? null : ids.join(',')

  const toggleCompareId = (id: string): void => {
    if (!id) return
    setSearchParams(prev => {
      const current = parseCompareList(prev.get('compare'))
      let nextIds: string[]
      if (current.includes(id)) {
        nextIds = current.filter(v => v !== id)
      } else if (current.length < COMPARE_MAX) {
        nextIds = [...current, id]
      } else {
        nextIds = current
      }
      return updateParam(prev, 'compare', writeCompare(nextIds))
    }, { replace: true })
  }

  const removeCompareId = (id: string): void => {
    setSearchParams(prev => {
      const current = parseCompareList(prev.get('compare'))
      const nextIds = current.filter(v => v !== id)
      return updateParam(prev, 'compare', writeCompare(nextIds))
    }, { replace: true })
  }

  const clearCompareIds = (): void => {
    setSearchParams(prev => updateParam(prev, 'compare', null), { replace: true })
  }

  return { compareIds, toggleCompareId, removeCompareId, clearCompareIds }
}


// ----- Composite (public) -----

export function useStrategyList(): StrategyListState {
  const [searchParams, setSearchParams] = useSearchParams()
  const { all, loading, error, symbols, timeframes } = useStrategyData()

  const sortKey = toSortKey(searchParams.get('sort'))
  const sortDir = toSortDir(searchParams.get('dir'))
  const groupBy = toGroupBy(searchParams.get('group'))
  const q = searchParams.get('q') ?? ''
  const symbolFilter = useMemo(
    () => (searchParams.get('symbol') ?? '').split(',').filter(Boolean),
    [searchParams],
  )
  const tfFilter = useMemo(
    () => (searchParams.get('tf') ?? '').split(',').filter(Boolean),
    [searchParams],
  )
  const sharpeMin = parseFloat(searchParams.get('sharpe_min') ?? '')
  const ddMax = parseFloat(searchParams.get('dd_max') ?? '')

  const filteredOnly = useFiltering(all, q, symbolFilter, tfFilter, sharpeMin, ddMax)
  const filtered = useSortedItems(filteredOnly, sortKey, sortDir)
  const groups = useGrouping(filtered, groupBy)

  const setSort = (key: SortKey): void => {
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

  const setGroupBy = (g: GroupBy): void => {
    setSearchParams(
      prev => updateParam(prev, 'group', g === 'none' ? null : g),
      { replace: true },
    )
  }

  const { selectedId, setSelectedId } = useSelectedId(searchParams, setSearchParams)
  const compare = useCompareSelection(searchParams, setSearchParams)

  return {
    all, filtered, groups, loading, error,
    sortKey, sortDir, setSort,
    groupBy, setGroupBy,
    symbols, timeframes,
    selectedId, setSelectedId,
    ...compare,
  }
}
