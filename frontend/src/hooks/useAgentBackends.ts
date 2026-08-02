import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AgentBackendsResponse } from '../api/types'

/**
 * AI 戦略開発バックエンド（claude / codex）の検出結果を 1 回だけ取得する。
 * 失敗時は data=null（= 機能非表示の縮退）。GUI 全体は巻き込まない。
 */
export function useAgentBackends(): {
  data: AgentBackendsResponse | null
  loading: boolean
} {
  const [data, setData] = useState<AgentBackendsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    api
      .getAgentBackends()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { data, loading }
}
