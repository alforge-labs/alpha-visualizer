import { NavLink } from 'react-router-dom'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'

interface NavItem {
  to: string
  ja: string
  en: string
}

const ITEMS: readonly NavItem[] = [
  { to: '/browse', ja: 'ブラウズ', en: 'Browse' },
  { to: '/compare', ja: '比較', en: 'Compare' },
  { to: '/ideas', ja: 'アイデア', en: 'Ideas' },
  { to: '/live', ja: 'ライブ', en: 'Live' },
]

/**
 * 常設のグローバルナビ（issue #263）。Browse/Compare/Ideas/Live への導線を全画面で
 * 提供し、`<nav>` ランドマークと aria-current で現在地を AT に伝える。
 */
export function AppNav({ lang }: { lang: Lang }) {
  const L = makeL(lang)
  return (
    <nav
      aria-label={L('メインナビゲーション', 'Main navigation')}
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        alignItems: 'center',
        padding: '8px var(--space-7)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          style={({ isActive }) => ({
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
            textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--text2)',
            fontWeight: isActive ? 700 : 500,
          })}
        >
          {lang === 'ja' ? it.ja : it.en}
        </NavLink>
      ))}
    </nav>
  )
}
