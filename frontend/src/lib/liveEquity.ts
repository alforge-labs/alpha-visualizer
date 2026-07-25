/**
 * Live equity 系列から KPI を導く純粋関数群（issue: Live リッチ化）。
 *
 * 副作用なし。入力配列を mutate しない。定義は
 * docs/superpowers/specs/2026-07-25-live-equity-rich-design.md に固定。
 */

/** ピークからの下方乖離（decimal・負値）を各時点で返す。 */
export function toDrawdown(values: readonly number[]): number[] {
  let peak = -Infinity
  return values.map((v) => {
    if (v > peak) peak = v
    return peak > 0 ? v / peak - 1 : 0
  })
}

/** 末尾時点のドローダウン（decimal・負値）。 */
export function currentDrawdown(values: readonly number[]): number {
  const dd = toDrawdown(values)
  return dd.length > 0 ? (dd[dd.length - 1] ?? 0) : 0
}

/** 最大値のインデックス。同値なら最初のものを返す。 */
export function peakIndex(values: readonly number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? -Infinity) > (values[best] ?? -Infinity)) best = i
  }
  return best
}

/** 直近 2 点の変化率（decimal）。2 点未満は null。 */
export function dayChangePct(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const prev = values[values.length - 2]
  const last = values[values.length - 1]
  if (prev == null || last == null || prev === 0) return null
  return last / prev - 1
}

/** 先頭から末尾までの変化率（decimal）。先頭が 0 なら 0。 */
export function totalReturnPct(values: readonly number[]): number {
  if (values.length < 2) return 0
  const first = values[0]
  const last = values[values.length - 1]
  if (first == null || last == null || first === 0) return 0
  return last / first - 1
}

/** 累計リターンの差をパーセントポイントで返す。比較不能なら null。 */
export function excessReturnPt(
  live: readonly number[],
  bench: readonly number[],
): number | null {
  if (live.length < 2 || bench.length < 2) return null
  return (totalReturnPct(live) - totalReturnPct(bench)) * 100
}

/** ISO 日時 2 つの暦日数差。 */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}
