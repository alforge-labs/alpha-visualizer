import type { ReactElement } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { LiveScreen } from '../screens/LiveScreen'
import { useLiveList } from '../hooks/useLiveList'
import { useLiveRefreshRunner } from '../hooks/useJobRunner'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/**
 * LivePage（Container、#221）。
 *
 * 役割:
 * - データ取得 (useLiveList) と画面設定 (useViewerSettings) のフック呼び出し
 * - 選択エントリの URL 同期（``?id=`` query param、未指定時は先頭を自動選択）
 * - ライブデータ一括更新ジョブ（useLiveRefreshRunner）の起動配線。成功時は
 *   一覧を再取得し、detailReloadKey を進めて詳細（LiveTab）を再フェッチさせる。
 *   ただし reload() は useLiveList 内部で setLoading(true) するため、実際には
 *   それ自体が LiveScreen の loading 分岐を介して LiveTab をアンマウント/
 *   リマウントし、detailReloadKey の有無に関わらず詳細は再フェッチされる。
 *   本番では detailReloadKey は冗長な二重化だが、将来 reload() が
 *   remount を起こさない実装（stale-while-revalidate 化等）に変わった際の
 *   保険として維持する（PR #506 最終レビュー指摘）。
 * - エラー時の早期 return
 *
 * Render は LiveScreen に委譲する（ADR-0001）。
 */
export function LivePage(): ReactElement {
  const { settings, update, setTheme } = useViewerSettings()
  const { lang, theme } = settings
  useDocumentTitle(lang === 'ja' ? 'ライブ実績' : 'Live')
  const { items, loading, error, reload } = useLiveList()
  const [detailReloadKey, setDetailReloadKey] = useState(0)
  const runner = useLiveRefreshRunner((status) => {
    // 成功時のみ一覧・詳細を再取得する（失敗時は DataPage と同方針で据え置く）
    if (status === 'succeeded') {
      reload()
      setDetailReloadKey((k) => k + 1)
    }
  })
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
      onSetTheme={setTheme}
      detailReloadKey={detailReloadKey}
      refresh={{
        running: runner.running,
        logLines: runner.logLines,
        error: runner.error,
        onStart: () => void runner.start({ action: 'refresh' }),
        onCancel: () => void runner.cancel(),
      }}
    />
  )
}
