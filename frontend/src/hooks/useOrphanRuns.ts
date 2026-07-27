import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { OrphanRunItem } from '../api/types'

/** 削除完了後の結果表示用ビューモデル（`MaintenanceScreen` の `result` prop の型）。 */
export interface PruneResultView {
  deletedCount: number
  deletedBacktestRows: number
  deletedOptimizationRows: number
  reclaimedBytes: number
  vacuumError: string | null
}

export interface UseOrphanRunsState {
  orphans: OrphanRunItem[]
  totalBytes: number
  loading: boolean
  error: string | null
  selectedIds: string[]
  toggleId: (strategyId: string) => void
  selectAll: () => void
  clearSelection: () => void
  deleteSelected: () => Promise<void>
  deleting: boolean
  result: PruneResultView | null
}

/**
 * 孤児バックテスト結果（strategies.db に定義の無い strategy_id の結果）の
 * 一覧取得・選択状態・削除実行をまとめる hook。`MaintenancePage` から使う。
 */
export function useOrphanRuns(): UseOrphanRunsState {
  const [orphans, setOrphans] = useState<OrphanRunItem[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<PruneResultView | null>(null)

  // 初回マウント時の取得。react-hooks/set-state-in-effect を避けるため、
  // 他 hook（useStrategyList / useIdeasList 等）と同様に .then/.catch で
  // 完了後にのみ setState する（effect 本体で同期的に setState しない）。
  useEffect(() => {
    let cancelled = false
    api.listOrphanRuns()
      .then(data => {
        if (cancelled) return
        setOrphans(data.orphans)
        setTotalBytes(data.total_bytes)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // 削除後の再取得用。イベントハンドラ（deleteSelected）からのみ呼ぶため、
  // effect 内呼び出しと違い setLoading(true) を同期的に呼んでも問題ない。
  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await api.listOrphanRuns()
      setOrphans(data.orphans)
      setTotalBytes(data.total_bytes)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const toggleId = (strategyId: string): void => {
    setSelectedIds(prev =>
      prev.includes(strategyId) ? prev.filter(id => id !== strategyId) : [...prev, strategyId],
    )
  }

  const selectAll = (): void => {
    setSelectedIds(orphans.map(o => o.strategy_id))
  }

  const clearSelection = (): void => {
    setSelectedIds([])
  }

  const deleteSelected = async (): Promise<void> => {
    // forge は --strategy 省略時に全孤児（実データで 128 件 / 83.4 MB）を削除する。
    // 空で投げるとサーバ側の 400 が最後の砦になるが、そこに頼らず手前でも止める
    // （2 段防御）。
    if (selectedIds.length === 0) return
    setDeleting(true)
    try {
      const res = await api.pruneOrphanRuns(selectedIds)
      setResult({
        deletedCount: res.deleted_strategy_ids.length,
        deletedBacktestRows: res.deleted_backtest_rows,
        deletedOptimizationRows: res.deleted_optimization_rows,
        reclaimedBytes: res.reclaimed_bytes,
        vacuumError: res.vacuum_error ?? null,
      })
      setSelectedIds([])
      setError(null)
      await reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  return {
    orphans,
    totalBytes,
    loading,
    error,
    selectedIds,
    toggleId,
    selectAll,
    clearSelection,
    deleteSelected,
    deleting,
    result,
  }
}
