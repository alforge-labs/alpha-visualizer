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
    setStore({
      ...store,
      settings: { ...store.settings, theme: e.matches ? 'dark' : 'light' },
    })
  }
  mql.addEventListener('change', onChange)
  unsubscribeOsTheme = () => mql.removeEventListener('change', onChange)
}

function getStore(): ViewerSettingsStore {
  if (store == null) {
    const stored = readStorage()
    const url = readUrlOverrides()
    const settings: ViewerSettings = {
      ...DEFAULTS,
      theme: getSystemTheme(),
      ...stored,
      ...url,
    }
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
  return { settings, update } as const
}
