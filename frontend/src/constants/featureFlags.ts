/**
 * Feature flag 解決ロジック。issue #180 の lightweight-charts PoC 用。
 *
 * 優先順位:
 *   1. URL クエリ `?tv=1` / `?tv=0` (top priority — セッション中は localStorage へ persist)
 *   2. localStorage['alpha.flags.lightweightCharts']
 *   3. import.meta.env.VITE_USE_LIGHTWEIGHT_CHARTS === '1'
 *   4. デフォルト false
 *
 * SSR / non-DOM コンテキストでは env と デフォルトだけを評価する。
 */

const LS_KEY = 'alpha.flags.lightweightCharts'
const QS_KEY = 'tv'

function readEnvFlag(): boolean {
  const raw = import.meta.env.VITE_USE_LIGHTWEIGHT_CHARTS
  return raw === '1' || raw === 'true'
}

function readQueryFlag(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(QS_KEY)) return null
    const v = params.get(QS_KEY)
    return v === '1' || v === 'true'
  } catch {
    return null
  }
}

function readStorageFlag(): boolean | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (raw == null) return null
    return raw === '1' || raw === 'true'
  } catch {
    return null
  }
}

function persistToStorage(value: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return
  try {
    window.localStorage.setItem(LS_KEY, value ? '1' : '0')
  } catch {
    // ignore quota / disabled localStorage
  }
}

/**
 * 現在の lightweight-charts レンダラ有効状態を返す。
 * URL クエリ指定があれば localStorage に同期して、リロード後も維持する。
 */
export function resolveLightweightChartsFlag(): boolean {
  const fromQuery = readQueryFlag()
  if (fromQuery != null) {
    persistToStorage(fromQuery)
    return fromQuery
  }
  const fromStorage = readStorageFlag()
  if (fromStorage != null) return fromStorage
  return readEnvFlag()
}

/**
 * 開発時のみ UI トグルを表示するかどうかの判定。
 * 本番ユーザーへの実験 UI 露出を防ぐため、`import.meta.env.DEV` か `?tv` クエリが指定された場合のみ。
 */
export function shouldShowRendererToggle(): boolean {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).has(QS_KEY)
  } catch {
    return false
  }
}

export function setLightweightChartsFlag(value: boolean): void {
  persistToStorage(value)
}
