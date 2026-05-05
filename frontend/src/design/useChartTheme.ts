import { useEffect, useState } from 'react'

export interface ChartTheme {
  text: string
  text2: string
  text3: string
  border: string
  borderStrong: string
  surface: string
  surface2: string
  bg: string
  bg2: string
  accent: string
  accentStrong: string
  accentGlow: string
  accentBg: string
  success: string
  warn: string
  danger: string
  serif: string
  sans: string
  mono: string
  /** Compare 等のマルチシリーズチャートで使う 5 色パレット（先頭は accent と一致） */
  series: readonly string[]
}

/** Atelier (light cream) 向けシリーズパレット — accent / steel / moss / umber / mauve */
const SERIES_ATELIER = ['#C25A2A', '#5B7A8C', '#4F7A3F', '#8B5E3C', '#7B5380'] as const
/** Lab (deep plum dark) 向けシリーズパレット */
const SERIES_LAB = ['#E89464', '#88A6B5', '#7FB36A', '#C28B5A', '#A98AAE'] as const

type ChartThemeColorKey = Exclude<keyof ChartTheme, 'series'>

const TOKEN_KEYS: Record<ChartThemeColorKey, string> = {
  text: '--text',
  text2: '--text2',
  text3: '--text3',
  border: '--border',
  borderStrong: '--border-h',
  surface: '--surface',
  surface2: '--surface-2',
  bg: '--bg',
  bg2: '--bg2',
  accent: '--accent',
  accentStrong: '--accent-strong',
  accentGlow: '--accent-glow',
  accentBg: '--accent-bg',
  success: '--success',
  warn: '--warn',
  danger: '--danger',
  serif: '--serif',
  sans: '--sans',
  mono: '--mono',
}

function readTheme(): ChartTheme {
  if (typeof document === 'undefined') {
    return { series: SERIES_ATELIER } as unknown as ChartTheme
  }
  const cs = getComputedStyle(document.documentElement)
  const out = {} as Record<string, string | readonly string[]>
  for (const key in TOKEN_KEYS) {
    const tokenKey = TOKEN_KEYS[key as keyof typeof TOKEN_KEYS]
    out[key] = cs.getPropertyValue(tokenKey).trim()
  }
  const variation = document.documentElement.dataset.variation
  out.series = variation === 'lab' ? SERIES_LAB : SERIES_ATELIER
  return out as unknown as ChartTheme
}

/**
 * <html data-variation> の変更をフックして、tokens.css の現在値から chart テーマを返す。
 * visx の軸・グリッド・ライン・ツールチップで参照する。
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme())

  useEffect(() => {
    if (typeof document === 'undefined') return
    const refresh = () => setTheme(readTheme())
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-variation', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}
