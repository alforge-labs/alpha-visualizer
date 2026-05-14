/**
 * BacktestDetail / EquityViewportPoint の形を lightweight-charts のシリーズデータへ変換する純粋関数。
 *
 * - `YYYY-MM-DD` の文字列は BusinessDay 互換 Time としてそのまま渡す。
 * - ISO datetime (`T` 区切りや `Z`) は UTCTimestamp に変換する。
 */
import type {
  HistogramData,
  LineData,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

import type { EquityViewportPoint } from '../../hooks/useEquityViewport'

const BUSINESS_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 'YYYY-MM-DD' なら BusinessDay 文字列、それ以外は UTCTimestamp に変換する。
 * パースできなければ `null` を返す（呼び出し側でフィルタする）。
 */
export function dateStringToTime(date: string): Time | null {
  const trimmed = date.trim()
  if (!trimmed) return null
  if (BUSINESS_DAY_RE.test(trimmed)) return trimmed as Time
  const ts = new Date(trimmed).getTime()
  if (!Number.isFinite(ts)) return null
  return Math.floor(ts / 1000) as UTCTimestamp
}

export function toLineData(dates: string[], values: number[]): LineData[] {
  const length = Math.min(dates.length, values.length)
  const out: LineData[] = []
  for (let i = 0; i < length; i++) {
    const date = dates[i]
    const value = values[i]
    if (date == null || value == null) continue
    if (!Number.isFinite(value)) continue
    const time = dateStringToTime(date)
    if (time == null) continue
    out.push({ time, value })
  }
  return out
}

/**
 * Drawdown を lightweight-charts の HistogramData へ変換する。
 * 元データは負の % を想定しているが、`Math.abs` は取らず、価格スケールが
 * 0 以下に伸びる（既存 DrawdownChartV と同じ視覚に揃える）。
 */
export function toHistogramData(dates: string[], values: number[]): HistogramData[] {
  const length = Math.min(dates.length, values.length)
  const out: HistogramData[] = []
  for (let i = 0; i < length; i++) {
    const date = dates[i]
    const value = values[i]
    if (date == null || value == null) continue
    if (!Number.isFinite(value)) continue
    const time = dateStringToTime(date)
    if (time == null) continue
    out.push({ time, value })
  }
  return out
}

export interface FromViewportPointsResult {
  equity: LineData[]
  benchmark: LineData[]
  /** points[i] の origIdx 配列 — cutoff マーカー位置の決定に使用 */
  origIndices: number[]
}

export function fromViewportPoints(points: EquityViewportPoint[]): FromViewportPointsResult {
  const equity: LineData[] = []
  const benchmark: LineData[] = []
  const origIndices: number[] = []
  for (const p of points) {
    const time = dateStringToTime(p.date.toISOString().slice(0, 10))
    if (time == null) continue
    equity.push({ time, value: p.value })
    if (p.benchmark != null && Number.isFinite(p.benchmark)) {
      benchmark.push({ time, value: p.benchmark })
    }
    origIndices.push(p.origIdx)
  }
  return { equity, benchmark, origIndices }
}

/**
 * IS/OOS cutoff マーカーを生成する。表示中の points の中に cutoff が無ければ空配列を返す。
 *
 * @param origIndices `fromViewportPoints` から得られる origIdx 配列
 * @param cutoffIdx 元 equity 配列内の cutoff インデックス
 * @param times `equity` シリーズと同じ Time 配列（origIndices と同じ length）
 */
export function makeCutoffMarkers(
  origIndices: number[],
  cutoffIdx: number,
  times: Time[],
  markerColor: string,
): SeriesMarker<Time>[] {
  if (cutoffIdx <= 0) return []
  const localIdx = origIndices.findIndex((i) => i >= cutoffIdx)
  if (localIdx <= 0 || localIdx >= origIndices.length - 1) return []
  const time = times[localIdx]
  if (time == null) return []
  return [
    {
      time,
      position: 'aboveBar',
      shape: 'arrowDown',
      color: markerColor,
      text: 'IS │ OOS',
    },
  ]
}
