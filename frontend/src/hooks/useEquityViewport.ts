import { useContext, useMemo, useState } from 'react'

import { DashboardContext } from '../contexts/DashboardContext'
import { RANGE_N, type SelectedRange } from '../contexts/dashboardConstants'

/**
 * Equity / Drawdown チャート用 viewport hook。
 *
 * - DashboardContext がある場合は context の `selectedRange` を使い、
 *   無い場合は internal state にフォールバックする。
 * - 選択中の range に応じて equity 系列の末尾 N 本だけを切り出す。
 *
 * 計算自体は pure function `sliceByRange` として独立させ、container 側で
 * 任意のシリーズに対して再利用できるようにしている。
 */
/**
 * overlay 1 本分の slice 入力。`EquityOverlay`（`EquityDrawdownPaneTV.tsx`）はこの形の
 * 上位互換（+ color / dashed）なので、そのまま渡せる。
 */
export interface EquityOverlayInput {
  label: string
  values: number[]
}

export interface EquityViewportInput {
  equity: number[]
  dates: string[]
  benchmark?: number[]
  overlays?: EquityOverlayInput[]
}

export interface EquityViewportPoint {
  date: Date
  value: number
  benchmark: number | null
  /** overlays[i] に対応する値（overlays 未指定時は空配列）。equity と同一インデックスで揃える */
  overlayValues: (number | null)[]
  /** 元の equity 配列でのインデックス（IS/OOS cutoff 判定に使用） */
  origIdx: number
}

export interface UseEquityViewportResult {
  /** 表示中の range（context があれば context、無ければ internal state） */
  range: SelectedRange
  /** range を切り替えるセッター */
  setRange: (next: SelectedRange) => void
  /** 表示対象の data point 列（末尾 N 本） */
  points: EquityViewportPoint[]
  /** points[0] が equity 配列のどのインデックスか */
  startIdx: number
}

/**
 * range に対応する末尾 N 本だけを切り出す pure function。
 */
export function sliceByRange(
  input: EquityViewportInput,
  range: SelectedRange,
): { points: EquityViewportPoint[]; startIdx: number } {
  const { equity, dates, benchmark, overlays } = input
  const n = equity.length
  const bars = Math.min(RANGE_N[range], n)
  const start = Math.max(0, n - bars)
  const points = equity.slice(start).map((v, i) => ({
    date: new Date(dates[start + i] ?? ''),
    value: v,
    benchmark: benchmark ? benchmark[start + i] ?? null : null,
    // overlays も equity と同じ `start + i` で切り出す。ここがズレると range 切替時に
    // 比較線が equity と噛み合わなくなる（本機能の存在意義そのもの）。
    overlayValues: (overlays ?? []).map((o) => o.values[start + i] ?? null),
    origIdx: start + i,
  }))
  return { points, startIdx: start }
}

export function useEquityViewport(input: EquityViewportInput): UseEquityViewportResult {
  const ctx = useContext(DashboardContext)
  const [localRange, setLocalRange] = useState<SelectedRange>('ALL')
  const range: SelectedRange = (ctx?.selectedRange ?? localRange) as SelectedRange
  const setRange = ctx?.setSelectedRange ?? setLocalRange

  const { equity, dates, benchmark, overlays } = input
  const { points, startIdx } = useMemo(
    () => sliceByRange({ equity, dates, benchmark, overlays }, range),
    [equity, dates, benchmark, overlays, range],
  )

  return { range, setRange, points, startIdx }
}
