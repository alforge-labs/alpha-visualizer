import { useMemo } from 'react'
import type { StrategyListItem } from '../api/types'
import { classifySymbol, type AssetClass } from '../lib/assetClass'

export interface SymbolStat {
  symbol: string | null   // null = Unassigned
  assetClass: AssetClass
  count: number
  bestSharpe: number | null
  avgReturnPct: number | null
  lastRunAt: string | null
}

function compareSymbolStats(a: SymbolStat, b: SymbolStat): number {
  // Unassigned は末尾固定
  if (a.symbol === null && b.symbol !== null) return 1
  if (b.symbol === null && a.symbol !== null) return -1
  // count desc
  if (a.count !== b.count) return b.count - a.count
  // bestSharpe desc（null は最後）
  const sa = a.bestSharpe ?? -Infinity
  const sb = b.bestSharpe ?? -Infinity
  if (sa !== sb) return sb - sa
  // symbol asc
  return (a.symbol ?? '').localeCompare(b.symbol ?? '')
}

export function useSymbolStats(items: StrategyListItem[]): SymbolStat[] {
  return useMemo(() => {
    const buckets = new Map<string, StrategyListItem[]>()
    const unassigned: StrategyListItem[] = []
    for (const s of items) {
      if (s.symbol == null || s.symbol === '') {
        unassigned.push(s)
      } else {
        const arr = buckets.get(s.symbol)
        if (arr) arr.push(s)
        else buckets.set(s.symbol, [s])
      }
    }

    const buildStat = (symbol: string | null, group: StrategyListItem[]): SymbolStat => {
      let bestSharpe: number | null = null
      let returnSum = 0
      let returnCount = 0
      let lastRunAt: string | null = null
      for (const s of group) {
        if (s.latest_sharpe != null) {
          bestSharpe = bestSharpe == null ? s.latest_sharpe : Math.max(bestSharpe, s.latest_sharpe)
        }
        if (s.latest_return_pct != null) {
          returnSum += s.latest_return_pct
          returnCount += 1
        }
        if (s.last_run_at && (lastRunAt == null || s.last_run_at > lastRunAt)) {
          lastRunAt = s.last_run_at
        }
      }
      return {
        symbol,
        assetClass: symbol == null ? 'other' : classifySymbol(symbol),
        count: group.length,
        bestSharpe,
        avgReturnPct: returnCount > 0 ? returnSum / returnCount : null,
        lastRunAt,
      }
    }

    const out: SymbolStat[] = []
    for (const [sym, group] of buckets.entries()) {
      out.push(buildStat(sym, group))
    }
    if (unassigned.length > 0) {
      out.push(buildStat(null, unassigned))
    }
    return out.sort(compareSymbolStats)
  }, [items])
}
