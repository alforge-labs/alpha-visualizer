import type { StrategyListItem } from '../api/types'
import type { RecentEntry } from '../hooks/useRecentStrategies'

export type MatchReason = 'name' | 'strategy_id' | 'symbol' | 'tag' | 'recent'

export interface CommandPaletteResult {
  item: StrategyListItem
  score: number
  reason: MatchReason
}

export const DEFAULT_RESULT_LIMIT = 20

interface MatchScore {
  score: number
  reason: MatchReason
}

function scoreItem(item: StrategyListItem, q: string): MatchScore | null {
  const name = item.name.toLowerCase()
  if (name.startsWith(q)) return { score: 100, reason: 'name' }
  if (name.includes(q)) return { score: 80, reason: 'name' }

  const sid = item.strategy_id.toLowerCase()
  if (sid.includes(q)) return { score: 70, reason: 'strategy_id' }

  if ((item.symbol ?? '').toLowerCase().includes(q)) {
    return { score: 60, reason: 'symbol' }
  }
  for (const ts of item.target_symbols ?? []) {
    if (ts.toLowerCase().includes(q)) return { score: 60, reason: 'symbol' }
  }

  for (const tag of item.tags ?? []) {
    if (tag.toLowerCase().includes(q)) return { score: 50, reason: 'tag' }
  }
  return null
}

export function searchStrategies(
  items: readonly StrategyListItem[],
  query: string,
  limit: number = DEFAULT_RESULT_LIMIT,
): CommandPaletteResult[] {
  const q = query.trim().toLowerCase()
  if (q === '') return []
  const out: CommandPaletteResult[] = []
  for (const item of items) {
    const m = scoreItem(item, q)
    if (m) out.push({ item, score: m.score, reason: m.reason })
  }
  out.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
  return out.slice(0, limit)
}

export function buildInitialResults(
  items: readonly StrategyListItem[],
  recent: readonly RecentEntry[],
  limit: number = DEFAULT_RESULT_LIMIT,
): CommandPaletteResult[] {
  const byId = new Map(items.map(i => [i.strategy_id, i]))
  const out: CommandPaletteResult[] = []
  const seen = new Set<string>()
  for (const r of recent) {
    const i = byId.get(r.strategy_id)
    if (!i || seen.has(i.strategy_id)) continue
    out.push({ item: i, score: 0, reason: 'recent' })
    seen.add(i.strategy_id)
    if (out.length >= limit) return out
  }
  for (const i of items) {
    if (seen.has(i.strategy_id)) continue
    out.push({ item: i, score: 0, reason: 'name' })
    seen.add(i.strategy_id)
    if (out.length >= limit) return out
  }
  return out
}
