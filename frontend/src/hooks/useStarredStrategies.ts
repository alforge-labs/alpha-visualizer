import { useCallback, useState } from 'react'

const STORAGE_KEY = 'alphaforge.starred_recipes.v1'

/**
 * 戦略（レシピ）のお気に入り（issue #379）。
 *
 * 数百戦略の環境で「運用中・検証中の数戦略」へ毎回フィルタ操作なしで
 * 到達できるよう、レシピ key を localStorage に保存する。
 * Saved Views（プリセット）や Recent（閲覧履歴）と違い、ユーザーが
 * 明示的に選んだ固定の集合。
 */

function readStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0))
  } catch {
    return new Set()
  }
}

function writeStorage(keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // ストレージ不可（プライベートモード等）でも UI は動作させる
  }
}

export interface StarredState {
  starredKeys: ReadonlySet<string>
  toggleStar: (key: string) => void
}

export function useStarredStrategies(): StarredState {
  const [starredKeys, setStarredKeys] = useState<ReadonlySet<string>>(readStorage)

  const toggleStar = useCallback((key: string) => {
    setStarredKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      writeStorage(next)
      return next
    })
  }, [])

  return { starredKeys, toggleStar }
}
