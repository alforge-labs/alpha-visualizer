/**
 * 時系列の rolling 統計を計算する純粋関数。
 *
 * 副作用なし。入力配列を mutate しない。
 */

const ANNUALIZATION_FACTOR = Math.sqrt(252)

/**
 * 日次リターン列から rolling Sharpe Ratio を計算する。
 *
 * - ``window`` 個未満の点は ``null``
 * - 標本分散が 0 のときは Sharpe を 0 として扱う（divide-by-zero 回避）
 * - 年率化係数は ``sqrt(252)``（営業日想定）
 *
 * @param returns 日次リターン (decimal)
 * @param window ローリング窓幅
 * @returns ``returns`` と同じ長さの配列。``null`` が入る箇所がある
 */
export function computeRollingSharpe(
  returns: readonly number[],
  window: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(returns.length).fill(null)
  if (window < 2 || window > returns.length) return result
  for (let i = window - 1; i < returns.length; i++) {
    const slice = returns.slice(i - window + 1, i + 1)
    const m = slice.reduce((a, b) => a + b, 0) / window
    const variance =
      slice.reduce((a, b) => a + (b - m) ** 2, 0) / (window - 1)
    const std = Math.sqrt(variance)
    result[i] = std === 0 ? 0 : (m / std) * ANNUALIZATION_FACTOR
  }
  return result
}
