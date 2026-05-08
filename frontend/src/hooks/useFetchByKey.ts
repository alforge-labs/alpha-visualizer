import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'

// Vite が PROD ビルドで `false` に静的置換 → DCE で IS_DEV ガード内が削除され、
// 呼び出し側が DEV のみ mockFallback を渡す前提なら PROD bundle から mock データが除外される。
const IS_DEV = import.meta.env.DEV

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; isMock: boolean }
  | { status: 'error'; error: string }

type FetchedState<T> =
  | { status: 'ready'; data: T; isMock: boolean }
  | { status: 'error'; error: string }

interface UseFetchByKeyOptions<T> {
  /**
   * 404 時 + key が null の同期 return 時に使う mock データ（DEV のみ）。
   * PROD では呼び出し側で `null` を渡すことで Vite の tree-shaking が効く。
   */
  mockFallback?: T | null
}

/**
 * key を引数に async fetch を行う汎用 hook（Template Method Pattern）。
 *
 * - key が null の場合: mockFallback があれば DEV で mock、無ければ `loading`
 * - key が変わったら自動的に再 fetch
 * - cancelled flag でアンマウント / key 変更時のレース対策
 * - 404 時は DEV のみ mock fallback、PROD では error
 *
 * 注: fetcher と mockFallback は呼び出し側が安定参照を渡す前提
 * （依存配列には key のみを含める）。
 */
export function useFetchByKey<T>(
  key: string | null,
  fetcher: (key: string) => Promise<T>,
  options: UseFetchByKeyOptions<T> = {},
): LoadState<T> {
  const { mockFallback = null } = options
  const [result, setResult] = useState<{ forKey: string; state: FetchedState<T> } | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetcher(key)
      .then((data) => {
        if (!cancelled) {
          setResult({ forKey: key, state: { status: 'ready', data, isMock: false } })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (IS_DEV && mockFallback != null && err instanceof ApiError && err.status === 404) {
          setResult({ forKey: key, state: { status: 'ready', data: mockFallback, isMock: true } })
          return
        }
        setResult({
          forKey: key,
          state: { status: 'error', error: err instanceof Error ? err.message : String(err) },
        })
      })
    return () => {
      cancelled = true
    }
    // fetcher / mockFallback は安定参照前提（呼び出し側が API 関数や module-level const を渡す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!key) {
    return IS_DEV && mockFallback != null
      ? { status: 'ready', data: mockFallback, isMock: true }
      : { status: 'loading' }
  }
  if (result?.forKey === key) return result.state
  return { status: 'loading' }
}
