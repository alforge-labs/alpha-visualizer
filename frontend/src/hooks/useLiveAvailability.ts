import { useEffect, useState } from 'react'
import { api } from '../api/client'

export interface LiveAvailability {
  /** この戦略にライブ実績サマリーが存在するか */
  hasLive: boolean
  /** listLive() が失敗した場合の生エラー（成功時 null）。issue #265 で silent 握りつぶしを廃止 */
  error: string | null
}

/**
 * `GET /api/live` から、指定戦略にライブ実績サマリーがあるか判定する（issue #265）。
 *
 * 旧実装は失敗を silent に hasLive=false としていたため、ライブタブ欠落の原因に
 * 気づけなかった。本フックは失敗を error として表面化させ、呼び出し側が通知できるようにする。
 */
export function useLiveAvailability(strategyId: string, reloadToken = 0): LiveAvailability {
  const [state, setState] = useState<LiveAvailability>({ hasLive: false, error: null })

  useEffect(() => {
    let cancelled = false
    api
      .listLive()
      .then((items) => {
        if (cancelled) return
        const match = items.some((it) => it.strategy_id === strategyId && it.has_summary)
        setState({ hasLive: match, error: null })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ hasLive: false, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [strategyId, reloadToken])

  return state
}
