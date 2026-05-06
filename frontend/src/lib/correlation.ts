/**
 * 戦略間の Pearson 相関を計算するユーティリティ。
 *
 * `daily_returns` を直接受け取り、長さが異なる場合は末尾を取って
 * 最小長に揃える（最近の取引日が共通している前提）。
 * NaN を含むペアは事前に除外し、有効サンプルが 2 未満や分散が 0 の場合は
 * 計算不能として `null` を返す。
 */

const MIN_OVERLAP = 2

function trailingWindow(values: number[], length: number): number[] {
  if (values.length <= length) return values
  return values.slice(values.length - length)
}

function dropNaNPairs(a: number[], b: number[]): { a: number[]; b: number[] } {
  const filteredA: number[] = []
  const filteredB: number[] = []
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined || y === undefined) continue
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    filteredA.push(x)
    filteredB.push(y)
  }
  return { a: filteredA, b: filteredB }
}

/**
 * 2 系列の Pearson 相関係数を返す。
 *
 * - 長さが異なる場合は末尾揃え（短い方の長さに統一）
 * - NaN を含む対応ペアは除外
 * - 有効ペアが {@link MIN_OVERLAP} 未満、または分散が 0 のとき `null`
 */
export function pearsonCorrelation(a: number[], b: number[]): number | null {
  if (a.length === 0 || b.length === 0) return null

  const n = Math.min(a.length, b.length)
  const aligned = dropNaNPairs(trailingWindow(a, n), trailingWindow(b, n))
  const xs = aligned.a
  const ys = aligned.b
  const len = xs.length
  if (len < MIN_OVERLAP) return null

  let sumX = 0
  let sumY = 0
  for (let i = 0; i < len; i++) {
    sumX += xs[i]!
    sumY += ys[i]!
  }
  const meanX = sumX / len
  const meanY = sumY / len

  let num = 0
  let denomX = 0
  let denomY = 0
  for (let i = 0; i < len; i++) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    num += dx * dy
    denomX += dx * dx
    denomY += dy * dy
  }

  if (denomX === 0 || denomY === 0) return null
  const r = num / Math.sqrt(denomX * denomY)
  if (!Number.isFinite(r)) return null
  // Numerical noise can push r marginally outside [-1, 1]; clamp it.
  if (r > 1) return 1
  if (r < -1) return -1
  return r
}

/**
 * N 系列の Pearson 相関行列を返す。
 *
 * - 計算不能なセルは `null`
 * - 対角は同系列との相関であり、有効なら 1、分散が 0 なら `null`
 */
export function correlationMatrix(seriesList: number[][]): (number | null)[][] {
  const n = seriesList.length
  const out: (number | null)[][] = Array.from({ length: n }, () => Array<number | null>(n).fill(null))
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const r = pearsonCorrelation(seriesList[i]!, seriesList[j]!)
      out[i]![j] = r
      out[j]![i] = r
    }
  }
  return out
}
