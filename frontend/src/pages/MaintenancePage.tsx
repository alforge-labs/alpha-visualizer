import type { ReactElement } from 'react'
import { MaintenanceScreen } from '../screens/MaintenanceScreen'
import { useOrphanRuns } from '../hooks/useOrphanRuns'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/**
 * MaintenancePage（Container）。
 *
 * 役割:
 * - データ取得・選択状態・削除実行 (useOrphanRuns) と画面設定 (useViewerSettings) の
 *   フック呼び出し
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
  const orphanRuns = useOrphanRuns()

  return (
    <MaintenanceScreen
      orphans={orphanRuns.orphans}
      totalBytes={orphanRuns.totalBytes}
      loading={orphanRuns.loading}
      error={orphanRuns.error}
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
