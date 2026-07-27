import { useEffect, useMemo, useState } from 'react'
import { type SetURLSearchParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { StrategyListItem } from '../api/types'
import { updateParam } from '../lib/searchParams'
import { buildRecipes, effectiveSymbol, type Recipe } from '../lib/recipes'

export type SortKey = 'name' | 'latest_sharpe' | 'latest_return_pct' | 'latest_max_drawdown_pct' | 'latest_profit_factor' | 'latest_win_rate_pct' | 'last_run_at'
export type SortDir = 'asc' | 'desc'
export type GroupBy = 'none' | 'symbol' | 'tf' | 'tier'

const VALID_SORT_KEYS: readonly SortKey[] = [
  'name', 'latest_sharpe', 'latest_return_pct', 'latest_max_drawdown_pct',
  'latest_profit_factor', 'latest_win_rate_pct', 'last_run_at',
] as const

const VALID_GROUP_BY: readonly GroupBy[] = ['none', 'symbol', 'tf', 'tier'] as const

function toIncludeUnrun(v: string | null): boolean {
  return v === '1'
}

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
  items: Recipe[]
  aggregate: GroupAggregate
}

export interface StrategyListState {
  all: StrategyListItem[]
  /**
   * 全戦略から作ったレシピ。絞り込み・未実行除外・並べ替えのいずれも通っていない。
   * 銘柄カバレッジ表のように「絞り込むためのナビゲーション」を描く側が使う。
   */
  allRecipes: Recipe[]
  /** 絞り込み・未実行除外・ソートを通したレシピ（表の描画対象） */
  recipes: Recipe[]
  /** 全戦略から作ったレシピ数。フィルタに依らない分母 */
  recipeTotal: number
  /** 未実行トグルで隠れているレシピ数。includeUnrun が true なら 0 */
  hiddenUnrunRecipeCount: number
  includeUnrun: boolean
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

function aggregate(recipes: Recipe[]): GroupAggregate {
  let bestSharpe: number | null = null
  let worstDd: number | null = null
  for (const r of recipes) {
    const sharpe = r.best?.latest_sharpe
    if (sharpe != null) {
      bestSharpe = bestSharpe == null ? sharpe : Math.max(bestSharpe, sharpe)
    }
    const dd = r.best?.latest_max_drawdown_pct
    if (dd != null) {
      worstDd = worstDd == null ? dd : Math.min(worstDd, dd)
    }
  }
  return { count: recipes.length, bestSharpe, worstDrawdownPct: worstDd }
}

function buildGroups(recipes: Recipe[], groupBy: GroupBy): StrategyGroup[] {
  if (groupBy === 'none') {
    if (recipes.length === 0) return []
    return [{ key: 'all', label: 'all', rank: 0, items: recipes, aggregate: aggregate(recipes) }]
  }

  if (groupBy === 'tier') {
    const buckets: Record<TierKey, Recipe[]> = {
      strong: [], moderate: [], weak: [], no_data: [],
    }
    for (const r of recipes) {
      buckets[sharpeTierKey(r.best?.latest_sharpe)].push(r)
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
  const keyOf = (r: Recipe): string =>
    groupBy === 'symbol' ? (r.symbol ?? '') : (r.timeframe ?? '')

  const map = new Map<string, Recipe[]>()
  for (const r of recipes) {
    const k = keyOf(r)
    const arr = map.get(k)
    if (arr) arr.push(r)
    else map.set(k, [r])
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
    () => [...new Set(all.map(effectiveSymbol).filter((s): s is string => Boolean(s)))].sort(),
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
    const needle = q.toLowerCase()
    return all.filter(s => {
      // 銘柄は実効銘柄で判定する。item.symbol だけを見ると、定義のみで
      // 銘柄が判明している戦略はチップに出るのに選ぶと 0 件になる。
      const symbol = effectiveSymbol(s) ?? ''
      if (q && !s.name.toLowerCase().includes(needle) && !symbol.toLowerCase().includes(needle)) return false
      if (symbolFilter.length > 0 && !symbolFilter.includes(symbol)) return false
      if (tfFilter.length > 0 && !tfFilter.includes(s.timeframe ?? '')) return false
      if (!isNaN(sharpeMin) && numVal(s.latest_sharpe) < sharpeMin) return false
      if (!isNaN(ddMax) && Math.abs(numVal(s.latest_max_drawdown_pct)) > ddMax) return false
      return true
    })
  }, [all, q, symbolFilter, tfFilter, sharpeMin, ddMax])
}


/**
 * レシピを best の指標で並べる。best が無いレシピは numVal で -Infinity 扱いになるため、
 * dir=desc では末尾に沈むが、dir=asc では逆に先頭に来る。
 */
function useSortedRecipes(
  recipes: Recipe[],
  sortKey: SortKey,
  sortDir: SortDir,
): Recipe[] {
  return useMemo(() => {
    return [...recipes].sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'name') {
        va = a.name
        vb = b.name
      } else if (sortKey === 'last_run_at') {
        va = a.best?.last_run_at ?? ''
        vb = b.best?.last_run_at ?? ''
      } else {
        va = numVal(a.best?.[sortKey] as number | null | undefined)
        vb = numVal(b.best?.[sortKey] as number | null | undefined)
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [recipes, sortKey, sortDir])
}


function useGrouping(recipes: Recipe[], groupBy: GroupBy): StrategyGroup[] {
  return useMemo(() => buildGroups(recipes, groupBy), [recipes, groupBy])
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
  const includeUnrun = toIncludeUnrun(searchParams.get('include_unrun'))
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

  const filtered = useFiltering(all, q, symbolFilter, tfFilter, sharpeMin, ddMax)

  // 絞り込み後の戦略をレシピへ畳む。未実行トグルはこのあとに効かせる。
  const filteredRecipes = useMemo(() => buildRecipes(filtered), [filtered])

  // 「隠した件数」は絞り込み後の集合に対して数える。全体から数えると、
  // フィルタで既に落ちているレシピまで「トグルで隠した」と報告してしまう。
  const unrunOnlyCount = useMemo(
    () => filteredRecipes.filter(r => r.runCount === 0).length,
    [filteredRecipes],
  )
  const visibleRecipes = useMemo(
    () => (includeUnrun ? filteredRecipes : filteredRecipes.filter(r => r.runCount > 0)),
    [filteredRecipes, includeUnrun],
  )

  const recipes = useSortedRecipes(visibleRecipes, sortKey, sortDir)
  const groups = useGrouping(recipes, groupBy)

  // 分母もカバレッジ表の入力も、フィルタに依らない全体のレシピ
  const allRecipes = useMemo(() => buildRecipes(all), [all])

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
    all, allRecipes, recipes,
    recipeTotal: allRecipes.length,
    hiddenUnrunRecipeCount: includeUnrun ? 0 : unrunOnlyCount,
    includeUnrun,
    groups, loading, error,
    sortKey, sortDir, setSort,
    groupBy, setGroupBy,
    symbols, timeframes,
    selectedId, setSelectedId,
    ...compare,
  }
}
