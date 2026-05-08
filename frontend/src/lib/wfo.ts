/**
 * Walk-Forward Optimization の集計・日付ヘルパ純関数。
 *
 * 副作用なし。入力配列を mutate しない。
 */

import type { WFOWindow } from '../api/types'

export interface WFOSummary {
  passCount: number
  total: number
  /** OOS/IS 比の平均（小数 2 桁丸めの string）。 */
  avgRatio: string
  /** IS Sharpe の平均（小数 2 桁丸めの string）。 */
  avgIS: string
  /** OOS Sharpe の平均（小数 2 桁丸めの string）。 */
  avgOOS: string
}

/**
 * WFO ウィンドウ列からダッシュボードに表示するサマリ統計を計算する。
 *
 * 平均値は表示用に ``toFixed(2)`` した string で返す（数値比較が必要な
 * 場合は ``Number(summary.avgRatio)`` 等で再パースする）。
 */
export function summarizeWfoWindows(windows: readonly WFOWindow[]): WFOSummary {
  const passCount = windows.filter(w => w.pass).length
  const total = Math.max(windows.length, 1)
  const ratioSum = windows.reduce((s, w) => s + w.oos_is_ratio, 0)
  const isSum = windows.reduce((s, w) => s + w.is_sharpe, 0)
  const oosSum = windows.reduce((s, w) => s + w.oos_sharpe, 0)
  return {
    passCount,
    total,
    avgRatio: (ratioSum / total).toFixed(2),
    avgIS: (isSum / total).toFixed(2),
    avgOOS: (oosSum / total).toFixed(2),
  }
}

/** ``YYYY-MM`` を月初 ``Date`` にパース。 */
export function parseMonth(s: string): Date {
  return new Date(`${s}-01`)
}

/** ``YYYY-MM`` を翌月初 ``Date`` にパース（=月末扱い）。 */
export function parseMonthEnd(s: string): Date {
  const d = new Date(`${s}-01`)
  d.setMonth(d.getMonth() + 1)
  return d
}
