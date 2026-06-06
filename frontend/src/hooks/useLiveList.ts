import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { LiveListItem } from '../api/types'

export interface LiveListState {
  items: LiveListItem[]
  loading: boolean
  error: string | null
}

/** ``GET /api/live`` の一覧を取得する（LivePage 用、#221）。 */
export function useLiveList(): LiveListState {
  const [items, setItems] = useState<LiveListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [])

  return { items, loading, error }
}
