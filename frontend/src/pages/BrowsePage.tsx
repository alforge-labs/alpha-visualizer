import { useEffect } from 'react'
import { BrowseScreen } from '../screens/BrowseScreen'
import { useStrategyList } from '../hooks/useStrategyList'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { ErrorBanner } from '../design/primitives'
import { makeL } from '../i18n/strings'
import { normalizeErrorMessage } from '../lib/errorMessage'

export function BrowsePage(): React.ReactElement {
  const { settings, update, setTheme } = useViewerSettings()
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
    // issue #390: 生のエラー文字列を直表示せず、他画面（Detail / Compare /
    // Maintenance）と同じ「正規化 + ErrorBanner + 再試行」ポリシーに揃える。
    const L = makeL(lang)
    return (
      <div style={{ padding: 'var(--space-7)', background: 'var(--bg)', minHeight: '100vh' }}>
        <ErrorBanner
          message={normalizeErrorMessage(list.error, lang)}
          title={list.error}
          retryLabel={L('再試行', 'Retry')}
          onRetry={list.reload}
        />
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
      onUpdateTheme={setTheme}
      onSelect={(id) => list.setSelectedId(list.selectedId === id ? null : id)}
      onCloseSlidePanel={() => list.setSelectedId(null)}
    />
  )
}
