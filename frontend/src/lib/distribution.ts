/**
 * リターン分布・ヒストグラム関連の純粋計算関数。
 *
 * 各 chart container はこれらを呼び出し、結果を Presentational visx に渡す。
 * 副作用なし、すべて入力配列を mutate しない。
 */

export interface HistogramBucket {
  /** バケット中央値（X 軸座標） */
  x: number
  /** バケットに入った件数 */
  count: number
  /** バケット幅 */
  width: number
}

export interface HistogramOptions {
  binCount: number
  /** ドメイン下限を強制したい場合（例: VaR 用に -0.5 を含める）。省略時は実データ最小 */
  domainMin?: number
  /** ドメイン上限を強制したい場合（例: VaR 用に 0 にクリップ）。省略時は実データ最大 */
  domainMax?: number
}

/**
 * 等幅ヒストグラムを計算する（純関数）。
 * 空配列は ``[]`` を返す。
 */
export function computeHistogram(
  values: number[],
  options: HistogramOptions,
): HistogramBucket[] {
  if (values.length === 0) return []
  const { binCount, domainMin, domainMax } = options
  const min = domainMin ?? Math.min(...values)
  const max = domainMax ?? Math.max(...values)
  const width = (max - min) / binCount || 0.01
  const counts = new Array(binCount).fill(0) as number[]
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / width), binCount - 1)
    if (idx >= 0) counts[idx] = (counts[idx] ?? 0) + 1
  }
  return counts.map((count, i) => ({
    x: min + (i + 0.5) * width,
    count,
    width,
  }))
}

/** 標準正規分布 PDF。``std === 0`` 時は 0 を返す。 */
export function normalPdf(x: number, mean: number, std: number): number {
  if (std === 0) return 0
  return Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI))
}

/** 算術平均。空配列は 0。 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** 標本標準偏差（n-1 ベース）。長さ 0/1 は 0。 */
export function sampleStd(values: readonly number[]): number {
  const n = values.length
  if (n < 2) return 0
  const m = mean(values)
  let sse = 0
  for (const v of values) sse += (v - m) ** 2
  return Math.sqrt(sse / (n - 1))
}
