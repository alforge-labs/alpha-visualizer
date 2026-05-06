import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'alphaforge.recent_strategies.v1'
const MAX_RECENT = 10

export interface RecentEntry {
  strategy_id: string
  opened_at: number
}

export interface RecentStrategiesState {
  recent: readonly RecentEntry[]
  push: (strategyId: string) => void
  clear: () => void
}

function readStorage(): RecentEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid: RecentEntry[] = []
    for (const item of parsed) {
      if (item == null || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      if (typeof obj.strategy_id !== 'string' || obj.strategy_id.length === 0) continue
      const openedAt = typeof obj.opened_at === 'number' ? obj.opened_at : 0
      valid.push({ strategy_id: obj.strategy_id, opened_at: openedAt })
    }
    return valid.slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function useRecentStrategies(): RecentStrategiesState {
  const [recent, setRecent] = useState<RecentEntry[]>(readStorage)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
    } catch {
      // storage disabled — ignore
    }
  }, [recent])

  const push = useCallback((strategyId: string): void => {
    if (!strategyId) return
    setRecent(prev => {
      const without = prev.filter(e => e.strategy_id !== strategyId)
      const next = [{ strategy_id: strategyId, opened_at: Date.now() }, ...without]
      return next.slice(0, MAX_RECENT)
    })
  }, [])

  const clear = useCallback((): void => {
    setRecent([])
  }, [])

  return { recent, push, clear }
}
