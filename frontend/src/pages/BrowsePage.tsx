import { useEffect } from 'react'
import { BrowseScreen } from '../screens/BrowseScreen'
import { useStrategyList } from '../hooks/useStrategyList'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function BrowsePage(): React.ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  useDocumentTitle(lang === 'ja' ? '戦略ブラウザ' : 'Strategy Browser')
  const list = useStrategyList()
  useScrollRestoration(!list.loading)

  const selectedStrategy = list.all.find(s => s.strategy_id === list.selectedId) ?? null

  // 狭幅ドロワー時に Esc で閉じる（issue #54）
  useEffect(() => {
    if (!list.selectedId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        list.setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list])

  if (list.error) {
    return (
      <div
        style={{
          padding: 'var(--space-7)',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-md)',
          color: 'var(--danger)',
          letterSpacing: 'var(--tracking-mono)',
          background: 'var(--bg)',
          minHeight: '100vh',
        }}
      >
        {list.error}
      </div>
    )
  }

  return (
    <BrowseScreen
      list={list}
      lang={lang}
      theme={theme}
      selectedStrategy={selectedStrategy}
      onUpdateLang={(l) => update('lang', l)}
      onUpdateTheme={(t) => {
        update('theme', t)
        update('variation', t === 'dark' ? 'lab' : 'atelier')
      }}
      onSelect={(id) => list.setSelectedId(list.selectedId === id ? null : id)}
      onCloseSlidePanel={() => list.setSelectedId(null)}
    />
  )
}
