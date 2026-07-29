import { useCallback, useMemo, useRef, useState } from 'react'
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
  // 取得を開始した strategyId。setEntries の updater は保留中の更新があると
  // 即時実行されないため、重複ガードを state 経由で行うと同じ戦略を何度も fetch する。
  // 呼び出し側は prefetch を useEffect から呼ぶため、それがそのまま API の無限ループになる。
  const requested = useRef<Set<string>>(new Set())

  const prefetch = useCallback((strategyId: string) => {
    if (requested.current.has(strategyId)) return
    requested.current.add(strategyId)
    setEntries(prev => ({ ...prev, [strategyId]: 'loading' }))

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

  // 呼び出し側は戻り値を useEffect の依存配列に入れるため、identity を安定させる
  // （毎レンダー新しいオブジェクトを返すと effect が再発火し続ける）。
  return useMemo(() => ({ entries, prefetch }), [entries, prefetch])
}
