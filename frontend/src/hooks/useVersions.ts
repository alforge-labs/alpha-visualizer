import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ComponentVersion } from '../api/types'

export interface UseVersionsState {
  components: ComponentVersion[]
  loading: boolean
  error: string | null
  /** 更新完了後などに一覧を取り直す。 */
  reload: () => Promise<void>
}

/**
 * 各種ツールのバージョン一覧を取得する hook。`MaintenancePage` から使う。
 *
 * サーバー側で個別の失敗は `unknown` に落ちて 200 が返るため、ここでの
 * `error` は API 呼び出し自体が失敗したときだけ立つ。
 */
export function useVersions(): UseVersionsState {
  const [components, setComponents] = useState<ComponentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 初回マウント時の取得。effect 本体で同期的に setState しない書き方を
  // 他 hook（useOrphanRuns 等）と揃える
  useEffect(() => {
    let cancelled = false
    api.getVersions()
      .then(data => {
        if (cancelled) return
        setComponents(data.components)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await api.getVersions()
      setComponents(data.components)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return { components, loading, error, reload }
}
