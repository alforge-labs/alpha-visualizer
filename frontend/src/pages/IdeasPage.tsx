import type { ReactElement } from 'react'
import { IdeasScreen } from '../screens/IdeasScreen'
import { useIdeasList } from '../hooks/useIdeasList'
import { useViewerSettings } from '../hooks/useTheme'

/**
 * IdeasPage（Container）。
 *
 * 役割:
 * - データ取得 (useIdeasList) と画面設定 (useViewerSettings) のフック呼び出し
 * - エラー時の早期 return
 * - ステート変更ハンドラの組み立て
 *
 * Render は IdeasScreen に委譲する（ADR-0001）。
 */
export function IdeasPage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  const list = useIdeasList()

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
    <IdeasScreen
      filtered={list.filtered}
      loading={list.loading}
      allTags={list.allTags}
      statusFilter={list.statusFilter}
      tagFilter={list.tagFilter}
      onStatusFilterChange={list.setStatusFilter}
      onTagFilterChange={list.setTagFilter}
      lang={lang}
      theme={theme}
      onSetLang={(l) => update('lang', l)}
      onSetTheme={(t) => {
        update('theme', t)
        update('variation', t === 'dark' ? 'lab' : 'atelier')
      }}
    />
  )
}
