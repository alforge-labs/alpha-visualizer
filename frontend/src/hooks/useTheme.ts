import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const initial = useMemo<ViewerSettings>(
    () => ({ ...DEFAULTS, ...readStorage(), ...readUrlOverrides() }),
    []
  )
  const [settings, setSettings] = useState<ViewerSettings>(initial)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // storage may be disabled (private mode etc.) — ignore silently
    }
  }, [settings])

  // variation を <html data-variation> に同期し、tokens.css の切替トリガーにする
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.variation = settings.variation
  }, [settings.variation])

  const update = useCallback(<K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { settings, update } as const
}
