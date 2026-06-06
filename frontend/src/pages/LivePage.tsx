import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LiveScreen } from '../screens/LiveScreen'
import { useLiveList } from '../hooks/useLiveList'
import { useViewerSettings } from '../hooks/useTheme'

/**
 * LivePage（Container、#221）。
 *
 * 役割:
 * - データ取得 (useLiveList) と画面設定 (useViewerSettings) のフック呼び出し
 * - 選択エントリの URL 同期（``?id=`` query param、未指定時は先頭を自動選択）
 * - エラー時の早期 return
 *
 * Render は LiveScreen に委譲する（ADR-0001）。
 */
export function LivePage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  const { items, loading, error } = useLiveList()
  const [searchParams, setSearchParams] = useSearchParams()

  if (error) {
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
        {error}
      </div>
    )
  }

  const selectedId = searchParams.get('id') ?? items[0]?.strategy_id ?? null

  return (
    <LiveScreen
      items={items}
      loading={loading}
      selectedId={selectedId}
      onSelect={(id) => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('id', id)
          return next
        })
      }}
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
