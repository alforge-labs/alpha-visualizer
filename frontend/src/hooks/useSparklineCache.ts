import { useCallback, useState } from 'react'
import { api } from '../api/client'

type SparklineEntry = number[] | 'loading' | 'empty'

export interface SparklineCache {
  /** strategyId -> equity values（ロード中・空・データ） */
  entries: Record<string, SparklineEntry>
  /** 最新 run の equity を非同期取得。重複呼び出しは無視 */
  prefetch: (strategyId: string) => void
}

/**
 * Browse 行ホバー用の sparkline data 取得 + キャッシュ。
 * 一度取得したら同セッション中は再フェッチしない。
 */
export function useSparklineCache(): SparklineCache {
  const [entries, setEntries] = useState<Record<string, SparklineEntry>>({})

  const prefetch = useCallback((strategyId: string) => {
    let alreadyKnown = false
    setEntries(prev => {
      if (prev[strategyId] !== undefined) {
        alreadyKnown = true
        return prev
      }
      return { ...prev, [strategyId]: 'loading' }
    })
    if (alreadyKnown) return

    void (async () => {
      try {
        const runs = await api.getStrategyRuns(strategyId)
        const latest = runs[0]
        if (!latest) {
          setEntries(prev => ({ ...prev, [strategyId]: 'empty' }))
          return
        }
        const detail = await api.getBacktest(latest.run_id)
        const values = detail.equity?.values ?? []
        setEntries(prev => ({
          ...prev,
          [strategyId]: values.length > 0 ? values : 'empty',
        }))
      } catch {
        setEntries(prev => ({ ...prev, [strategyId]: 'empty' }))
      }
    })()
  }, [])

  return { entries, prefetch }
}
