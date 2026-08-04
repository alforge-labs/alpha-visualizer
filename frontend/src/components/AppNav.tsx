import { NavLink } from 'react-router'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { useNavMemory } from '../hooks/useNavMemory'

interface NavItem {
  to: string
  ja: string
  en: string
}

const ITEMS: readonly NavItem[] = [
  { to: '/browse', ja: 'ブラウズ', en: 'Browse' },
  { to: '/compare', ja: '比較', en: 'Compare' },
  { to: '/runs', ja: '実行一覧', en: 'Runs' },
  { to: '/data', ja: 'データ', en: 'Data' },
  { to: '/ideas', ja: 'アイデア', en: 'Ideas' },
  { to: '/live', ja: 'ライブ', en: 'Live' },
  { to: '/maintenance', ja: '整理', en: 'Maintenance' },
]

// AI 戦略開発（/develop）は localhost 限定機能（backends.enabled）のため、
// 既定の ITEMS には含めず showDevelop で条件表示する（Task 10）。
const DEVELOP_ITEM: NavItem = { to: '/develop', ja: '開発', en: 'Develop' }

// useNavMemory へ渡す記憶対象。showDevelop に依らず全セクションを含めて
// 参照同一性を保つ（毎 render で作り直すと記憶の effect が回り続ける）。
const MEMORIZED_PATHS: readonly string[] = [...ITEMS, DEVELOP_ITEM].map(it => it.to)

/**
 * 常設のグローバルナビ（issue #263）。Browse/Compare/Ideas/Live/Maintenance への
 * 導線を全画面で提供し、`<nav>` ランドマークと aria-current で現在地を AT に伝える。
 *
 * `showDevelop` は `RootLayout` が `useAgentBackends().data?.enabled` から渡す。
 * 非 loopback 公開中や未検出時は「開発」項目自体を出さない（Task 10）。
 *
 * リンク先には各セクションで最後に見ていた URL params を復元する
 * （issue #481）。素の `/browse` へ飛ばすと、タブを往復しただけで絞り込みも
 * 比較対象も消える。
 */
export function AppNav({ lang, showDevelop = false }: { lang: Lang; showDevelop?: boolean }) {
  const L = makeL(lang)
  const resolvePath = useNavMemory(MEMORIZED_PATHS)
  // ライブの後・整理の前に挿入する（ITEMS[5]=live, ITEMS[6]=maintenance）
  const items = showDevelop ? [...ITEMS.slice(0, 6), DEVELOP_ITEM, ...ITEMS.slice(6)] : ITEMS
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
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={resolvePath(it.to)}
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
