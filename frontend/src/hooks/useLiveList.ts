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
  // error も併せてクリアしないと、reload 成功後も items は最新なのに
  // 直前の失敗時の error が残り続け、error 優先で早期 return する consumer
  // （LivePage 等）が永久にエラー画面から戻れなくなる。
  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
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
