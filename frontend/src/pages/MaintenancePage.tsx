import type { ReactElement } from 'react'
import { useState } from 'react'
import { MaintenanceScreen } from '../screens/MaintenanceScreen'
import { useOrphanRuns } from '../hooks/useOrphanRuns'
import { useVersions } from '../hooks/useVersions'
import { useComponentUpdateRunner } from '../hooks/useJobRunner'
import { useServerRestart } from '../hooks/useServerRestart'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { extractApiErrorDetail, messageForApiErrorCode } from '../lib/errorMessage'

/**
 * MaintenancePage（Container）。
 *
 * 役割:
 * - データ取得・選択状態・削除実行 (useOrphanRuns) と画面設定 (useViewerSettings) の
 *   フック呼び出し
 * - エラーメッセージの正規化（`extractApiErrorDetail`）。この API の 4xx/5xx は
 *   detail にユーザー向け bilingual 文言が入っている（forge 未導入時の案内等）ため、
 *   `normalizeErrorMessage` の定型文には潰さない（`ComparePage.tsx` の 500 潰しとは
 *   事情が異なる。`DuplicateStrategyCard.tsx` と同じ理由）。
 *
 * `error` はページ単位の早期 return にせず、そのまま `MaintenanceScreen` に渡す
 * （一覧・エラー・削除結果を同一画面内で並べて見せるため）。
 *
 * Render は MaintenanceScreen に委譲する（ADR-0001）。
 */
export function MaintenancePage(): ReactElement {
  const { settings } = useViewerSettings()
  const { lang } = settings
  useDocumentTitle(lang === 'ja' ? '整理' : 'Maintenance')
  const versions = useVersions()
  const restart = useServerRestart()
  // どのコンポーネントを更新中かは runner が持たないため、ここで覚える。
  // 完了時にどちらの後処理（一覧再取得 / 再起動待ち）へ進むかの分岐に使う
  const [updatingId, setUpdatingId] = useState<'forge' | 'visualizer' | null>(null)

  const updateRunner = useComponentUpdateRunner((status) => {
    const finished = updatingId
    setUpdatingId(null)
    // 失敗・キャンセル時は何もしない。再起動は成功パスにのみ紐づける
    if (status !== 'succeeded') return
    if (finished === 'visualizer') {
      restart.begin()
    } else {
      void versions.reload()
    }
  })

  const handleUpdate = (component: 'forge' | 'visualizer'): void => {
    setUpdatingId(component)
    // ジョブ作成 API 自体が失敗した場合（409/403 等）、useJobRunnerCore は
    // finish() を呼ばず onFinished も発火しないため false を返すだけで終わる。
    // ここで拾って updatingId を戻さないと、更新ボタンが永久に disabled のまま
    // 固まる（review Important）。
    void updateRunner.start(component).then((ok) => {
      if (!ok) setUpdatingId(null)
    })
  }

  const orphanRuns = useOrphanRuns()
  // 機械可読 code を持つ想定内エラー（forge CLI 未導入等）は表示言語のみの
  // 文言へ写像し、それ以外はサーバー detail の抽出へフォールバック (issue #358)
  const errorMessage = orphanRuns.error
    ? (messageForApiErrorCode(orphanRuns.error, lang) ??
      extractApiErrorDetail(orphanRuns.error, lang))
    : null

  return (
    <MaintenanceScreen
      versions={versions.components}
      versionsLoading={versions.loading}
      versionsError={versions.error}
      onUpdateComponent={handleUpdate}
      updatingComponentId={updatingId}
      restarting={restart.waiting}
      restartTimedOut={restart.timedOut}
      orphans={orphanRuns.orphans}
      totalBytes={orphanRuns.totalBytes}
      loading={orphanRuns.loading}
      error={orphanRuns.error}
      errorMessage={errorMessage}
      onRetry={orphanRuns.reload}
      selectedIds={orphanRuns.selectedIds}
      onToggleId={orphanRuns.toggleId}
      onSelectAll={orphanRuns.selectAll}
      onClearSelection={orphanRuns.clearSelection}
      onDelete={orphanRuns.deleteSelected}
      deleting={orphanRuns.deleting}
      result={orphanRuns.result}
      lang={lang}
    />
  )
}
