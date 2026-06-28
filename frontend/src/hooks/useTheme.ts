import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

export function useViewerSettings() {
  const initial = useMemo(() => {
    const stored = readStorage()
    const url = readUrlOverrides()
    const settings: ViewerSettings = {
      ...DEFAULTS,
      theme: getSystemTheme(),
      ...stored,
      ...url,
    }
    // theme を storage か URL で明示していたら「ユーザー明示設定あり」とみなす（issue #266）
    const themeExplicit = 'theme' in stored || 'theme' in url
    return { settings, themeExplicit }
  }, [])
  const [settings, setSettings] = useState<ViewerSettings>(initial.settings)
  // ユーザーが theme を明示選択したか。明示している間は OS 追従しない（issue #266）。
  const themeExplicitRef = useRef<boolean>(initial.themeExplicit)

  useEffect(() => {
    try {
      // issue #266: 明示選択していない間は theme を保存しない。
      // 保存してしまうと再読込時に「明示あり」と誤認し、OS 追従が止まるため。
      const toStore: Record<string, unknown> = {
        density: settings.density,
        variation: settings.variation,
        lang: settings.lang,
      }
      if (themeExplicitRef.current) toStore.theme = settings.theme
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
    } catch {
      // storage may be disabled (private mode etc.) — ignore silently
    }
  }, [settings])

  // issue #266: OS のカラースキーム変更を購読し、ユーザー明示設定が無い場合のみ追従する。
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => {
      if (themeExplicitRef.current) return
      setSettings((prev) => ({ ...prev, theme: e.matches ? 'dark' : 'light' }))
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // variation を <html data-variation> に同期し、tokens.css の切替トリガーにする
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.variation = settings.variation
  }, [settings.variation])

  // theme を <html data-theme> に同期する
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  // lang を <html lang> に同期し、SR の読み上げ言語・翻訳/検索の言語判定を正す（issue #261）
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = settings.lang
  }, [settings.lang])

  const update = useCallback(<K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) => {
    // theme を明示更新したら以降は OS 追従を止める（issue #266）
    if (key === 'theme') themeExplicitRef.current = true
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { settings, update } as const
}
