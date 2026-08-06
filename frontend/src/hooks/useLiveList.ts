import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { LiveListItem } from '../api/types'

export interface LiveListState {
  items: LiveListItem[]
  loading: boolean
  error: string | null
  /** 一覧を再取得する（live refresh ジョブ成功後の反映用） */
  reload: () => void
}

/** ``GET /api/live`` の一覧を取得する（LivePage 用、#221）。 */
export function useLiveList(): LiveListState {
  const [items, setItems] = useState<LiveListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // reload は明示的なイベントハンドラ呼び出し（effect 本体からの同期 setState
  // ではない）なので react-hooks/set-state-in-effect に抵触しない。
  // useStrategyList の useStrategyData と同じパターン（issue #390）。
  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .listLive()
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  return { items, loading, error, reload }
}
