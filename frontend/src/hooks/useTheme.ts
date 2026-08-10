import { useCallback, useSyncExternalStore } from 'react'
import type { Lang } from '../i18n/strings'

export type Theme = 'dark' | 'light'
export type Density = 'comfortable' | 'compact'
export type Variation = 'atelier' | 'lab'

export interface ViewerSettings {
  theme: Theme
  density: Density
  variation: Variation
  lang: Lang
}

const STORAGE_KEY = 'alphaforge.viewer.settings.v1'
const DEFAULTS: ViewerSettings = {
  theme: 'light',
  density: 'comfortable',
  variation: 'atelier',
  lang: 'ja',
}

/** theme に対応する配色トークンのセット。tokens.css の data-variation で切り替わる。 */
function variationForTheme(theme: Theme): Variation {
  return theme === 'dark' ? 'lab' : 'atelier'
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const THEMES: readonly Theme[] = ['dark', 'light']
const DENSITIES: readonly Density[] = ['comfortable', 'compact']
const VARIATIONS: readonly Variation[] = ['atelier', 'lab']
const LANGS: readonly Lang[] = ['ja', 'en']

function readUrlOverrides(): Partial<ViewerSettings> {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const out: Partial<ViewerSettings> = {}
  const theme = params.get('theme')
  if (theme && (THEMES as readonly string[]).includes(theme)) out.theme = theme as Theme
  const density = params.get('density')
  if (density && (DENSITIES as readonly string[]).includes(density)) out.density = density as Density
  const variation = params.get('variation')
  if (variation && (VARIATIONS as readonly string[]).includes(variation))
    out.variation = variation as Variation
  const lang = params.get('lang')
  if (lang && (LANGS as readonly string[]).includes(lang)) out.lang = lang as Lang
  return out
}

function readStorage(): Partial<ViewerSettings> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const obj = parsed as Record<string, unknown>
    const out: Partial<ViewerSettings> = {}
    if (typeof obj.theme === 'string' && (THEMES as readonly string[]).includes(obj.theme))
      out.theme = obj.theme as Theme
    if (typeof obj.density === 'string' && (DENSITIES as readonly string[]).includes(obj.density))
      out.density = obj.density as Density
    // 読み取りは残すが、実効値は theme から導出する（getStore を参照）。
    // persist() が常に書き出す値なので「ユーザーが明示した」証拠にならない
    if (typeof obj.variation === 'string' && (VARIATIONS as readonly string[]).includes(obj.variation))
      out.variation = obj.variation as Variation
    if (typeof obj.lang === 'string' && (LANGS as readonly string[]).includes(obj.lang))
      out.lang = obj.lang as Lang
    return out
  } catch {
    return {}
  }
}

// ===== モジュールレベル共有ストア（issue #315） =====
// 以前はフックごとに独立した useState を持っていたため、Page 側の LangToggle で
// 言語を切り替えても RootLayout（AppNav）側の別インスタンスに反映されなかった。
// useSyncExternalStore で全呼び出し元が単一の状態を購読する。

interface ViewerSettingsStore {
  settings: ViewerSettings
  // ユーザーが theme を明示選択したか。明示している間は OS 追従しない（issue #266）。
  themeExplicit: boolean
}

let store: ViewerSettingsStore | null = null
const listeners = new Set<() => void>()
let unsubscribeOsTheme: (() => void) | null = null

function persist(s: ViewerSettingsStore): void {
  if (typeof window === 'undefined') return
  try {
    // issue #266: 明示選択していない間は theme を保存しない。
    // 保存してしまうと再読込時に「明示あり」と誤認し、OS 追従が止まるため。
    const toStore: Record<string, unknown> = {
      density: s.settings.density,
      variation: s.settings.variation,
      lang: s.settings.lang,
    }
    if (s.themeExplicit) toStore.theme = s.settings.theme
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch {
    // storage may be disabled (private mode etc.) — ignore silently
  }
}

/**
 * variation / theme を <html data-*> に、lang を <html lang> に同期する。
 * data-variation は tokens.css の切替トリガー、lang は SR の読み上げ言語判定（issue #261）。
 */
function syncDocument(settings: ViewerSettings): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.variation = settings.variation
  document.documentElement.dataset.theme = settings.theme
  document.documentElement.lang = settings.lang
}

function setStore(next: ViewerSettingsStore): void {
  store = next
  persist(next)
  syncDocument(next.settings)
  for (const cb of listeners) cb()
}

// issue #266: OS のカラースキーム変更を購読し、ユーザー明示設定が無い場合のみ追従する。
function subscribeOsTheme(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (e: MediaQueryListEvent): void => {
    if (store == null || store.themeExplicit) return
    const theme: Theme = e.matches ? 'dark' : 'light'
    setStore({
      ...store,
      // 明示切替（setThemeSetting）と同じく variation も対で動かす。
      // ここを theme だけにすると「dark テーマ + light 用トークン」になる
      settings: { ...store.settings, theme, variation: variationForTheme(theme) },
    })
  }
  mql.addEventListener('change', onChange)
  unsubscribeOsTheme = () => mql.removeEventListener('change', onChange)
}

function getStore(): ViewerSettingsStore {
  if (store == null) {
    const stored = readStorage()
    const url = readUrlOverrides()
    const resolved: ViewerSettings = {
      ...DEFAULTS,
      theme: getSystemTheme(),
      ...stored,
      ...url,
    }
    // variation は theme から導出する。DEFAULTS の atelier のまま残すと、
    // OS が dark のユーザーが初回表示で「dark テーマ + light 用トークン」を見る。
    //
    // storage の variation は「明示した」判定に使えない。theme と違って
    // persist() が常に書き出すため（＝導出値も保存される）、ユーザーの意思と
    // 前回の導出結果を区別できないからである。前回 dark で保存した lab が
    // OS を light に戻した次回起動へ持ち越されると、また不一致になる。
    // 明示扱いにするのは URL 上書き（デバッグ・撮影用）だけにする。
    const variationExplicit = 'variation' in url
    const settings: ViewerSettings = variationExplicit
      ? resolved
      : { ...resolved, variation: variationForTheme(resolved.theme) }
    // theme を storage か URL で明示していたら「ユーザー明示設定あり」とみなす（issue #266）
    store = { settings, themeExplicit: 'theme' in stored || 'theme' in url }
    persist(store)
    syncDocument(store.settings)
    subscribeOsTheme()
  }
  return store
}

function getSnapshot(): ViewerSettings {
  return getStore().settings
}

function subscribe(cb: () => void): () => void {
  getStore()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function updateSetting<K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]): void {
  const current = getStore()
  setStore({
    settings: { ...current.settings, [key]: value },
    // theme を明示更新したら以降は OS 追従を止める（issue #266）
    themeExplicit: key === 'theme' ? true : current.themeExplicit,
  })
}

/**
 * theme と variation を 1 操作として切り替える。
 *
 * この 2 つは対で動く（dark は lab、light は atelier）。以前は各 Page が
 * `update('theme', t)` と `update('variation', ...)` を 2 回呼ぶ形で、同じ式が
 * 9 画面へコピーされていた。実際に DataPage で variation の更新が抜け、
 * データ画面だけダーク時の配色が揃わない不具合が起きている。
 *
 * 原子的に更新することで、取りこぼしが構造的に起きなくなるうえ、
 * 購読者への通知と localStorage への書き込みも 1 回で済む。
 */
function setThemeSetting(theme: Theme): void {
  const current = getStore()
  setStore({
    settings: { ...current.settings, theme, variation: variationForTheme(theme) },
    // 明示選択なので以降は OS 追従を止める（issue #266・updateSetting と同じ）
    themeExplicit: true,
  })
}

/**
 * テスト専用: モジュールレベルの共有状態を破棄し、次のアクセスで
 * localStorage / URL から再初期化させる。プロダクションコードでは使用しない。
 */
export function resetViewerSettingsStoreForTest(): void {
  store = null
  listeners.clear()
  unsubscribeOsTheme?.()
  unsubscribeOsTheme = null
}

export function useViewerSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot)
  const update = useCallback(<K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) => {
    updateSetting(key, value)
  }, [])
  // theme 単体の update ではなくこちらを使う（variation の取りこぼしを防ぐ）
  const setTheme = useCallback((theme: Theme) => {
    setThemeSetting(theme)
  }, [])
  return { settings, update, setTheme } as const
}
