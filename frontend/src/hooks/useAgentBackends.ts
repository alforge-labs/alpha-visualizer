import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AgentBackendsResponse } from '../api/types'

/**
 * 進行中・解決済みの検出結果。RootLayout（ナビ表示の判定）と DevelopPage が
 * 別インスタンスで呼ぶため、共有しないと画面遷移のたびにサーバー側で
 * claude / codex の `--version` サブプロセスが起動する。検出結果はサーバーの
 * プロセス寿命の間は変わらないので使い回してよい。
 */
let shared: Promise<AgentBackendsResponse> | null = null

function fetchShared(): Promise<AgentBackendsResponse> {
  if (shared === null) {
    // 失敗は共有しない: サーバー起動直後の一時的な失敗をキャッシュすると、
    // リロードするまで開発ビューが非表示のまま固定されてしまう
    shared = api.getAgentBackends().catch((e: unknown) => {
      shared = null
      throw e
    })
  }
  return shared
}

/** テスト専用: 共有中の検出結果を破棄する（テスト間の持ち越し防止）。 */
export function resetAgentBackendsCache(): void {
  shared = null
}

/**
 * AI 戦略開発バックエンド（claude / codex）の検出結果を取得する。
 * 複数の呼び出し元がマウントしても取得は 1 回に集約される。
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
    fetchShared()
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
