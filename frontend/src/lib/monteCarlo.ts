/**
 * Monte Carlo シミュレーション pure function。
 *
 * トレードリターン列を入力に、N 回のリサンプリング（with replacement）で
 * エクイティ曲線を生成し、指定タイミングでの percentile band を返す。
 *
 * - 既定では LCG（線形合同法）に固定 seed を入れて決定論的に動作する
 *   （既存 `MonteCarloChart` の挙動を保持）。
 * - `seed` を変更すれば異なる経路を、`seed = null` を指定すれば
 *   `Math.random()` ベースの非決定論的経路を生成する。
 */

export interface MonteCarloOptions {
  /** 各トレードのリターン（pnl / equity の比率、例: 0.01 = +1%） */
  trades: number[]
  /** シミュレーション回数 */
  nSimulations: number
  /** 初期エクイティ。既定: 100 */
  initialEquity?: number
  /**
   * percentile を計算する曲線上の x 位置（トレードインデックス）。
   * 省略時は `[0, step, 2*step, ..., trades.length]` を `step ≒ length/120` で生成。
   */
  samplePoints?: number[]
  /**
   * LCG 用 seed（uint32）。
   * - 既定: `0x12345678`（既存 MonteCarloChart と同じ）
   * - `null` 指定で `Math.random()` を使う非決定論モード
   */
  seed?: number | null
}

export interface MonteCarloPercentileBands {
  p5: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p95: number[]
}

export interface MonteCarloFinalStats {
  /** 最終エクイティの 5 percentile */
  p5: number
  /** 最終エクイティの中央値 */
  p50: number
  /** 最終エクイティの 95 percentile */
  p95: number
  /** 最終エクイティが initialEquity を下回った確率（%） */
  lossProb: number
}

export interface MonteCarloResult {
  /** percentile を計算した x 位置（トレードインデックス）の昇順列 */
  xs: number[]
  /** 各時点での percentile band（band 配列の長さは xs.length） */
  bands: MonteCarloPercentileBands
  /** 各シミュレーションの最終エクイティ（昇順） */
  finalEquities: number[]
  /** 最終エクイティの percentile / 損失確率 */
  finalStats: MonteCarloFinalStats
}

const DEFAULT_SEED = 0x12345678

/**
 * Mulberry / LCG 互換の単純な決定論 PRNG。`seed` を更新するクロージャ。
 */
function makeIndexSampler(maxExclusive: number, seed: number | null): () => number {
  if (seed === null) {
    return () => Math.floor(Math.random() * Math.max(1, maxExclusive))
  }
  let state = seed | 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0
    return (state >>> 0) % Math.max(1, maxExclusive)
  }
}

function defaultSamplePoints(length: number): number[] {
  const step = Math.max(1, Math.floor(length / 120))
  const xs: number[] = []
  for (let i = 0; i <= length; i += step) xs.push(i)
  if (xs[xs.length - 1] !== length) xs.push(length)
  return xs
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[idx] ?? 0
}

export function runMonteCarlo(opts: MonteCarloOptions): MonteCarloResult {
  const initialEquity = opts.initialEquity ?? 100
  const seed = opts.seed === undefined ? DEFAULT_SEED : opts.seed
  const tradesN = opts.trades.length
  const sims = Math.max(0, opts.nSimulations | 0)
  const xs = opts.samplePoints ?? defaultSamplePoints(tradesN)

  // 空のトレード or 0 シミュレーションの場合はフラットなエクイティを返す。
  if (tradesN === 0 || sims === 0) {
    const flat = xs.map(() => initialEquity)
    return {
      xs,
      bands: { p5: [...flat], p25: [...flat], p50: [...flat], p75: [...flat], p95: [...flat] },
      finalEquities: sims === 0 ? [] : Array.from({ length: sims }, () => initialEquity),
      finalStats: {
        p5: initialEquity,
        p50: initialEquity,
        p95: initialEquity,
        lossProb: 0,
      },
    }
  }

  const sampleIdx = makeIndexSampler(tradesN, seed)

  // 全シミュレーションのエクイティ曲線を構築。
  const curves: number[][] = []
  for (let s = 0; s < sims; s++) {
    let eq = initialEquity
    const curve: number[] = [initialEquity]
    for (let i = 0; i < tradesN; i++) {
      eq = Math.max(eq * (1 + (opts.trades[sampleIdx()] ?? 0)), 0.01)
      curve.push(eq)
    }
    curves.push(curve)
  }

  // x 位置ごとに percentile を集計。
  const bands: MonteCarloPercentileBands = { p5: [], p25: [], p50: [], p75: [], p95: [] }
  for (const xi of xs) {
    const vals = curves.map(c => c[xi] ?? 0).sort((a, b) => a - b)
    bands.p5.push(percentile(vals, 5))
    bands.p25.push(percentile(vals, 25))
    bands.p50.push(percentile(vals, 50))
    bands.p75.push(percentile(vals, 75))
    bands.p95.push(percentile(vals, 95))
  }

  const finalEquities = curves.map(c => c[tradesN] ?? initialEquity).sort((a, b) => a - b)
  const lossCount = finalEquities.filter(f => f < initialEquity).length

  return {
    xs,
    bands,
    finalEquities,
    finalStats: {
      p5: percentile(finalEquities, 5),
      p50: percentile(finalEquities, 50),
      p95: percentile(finalEquities, 95),
      lossProb: (lossCount / sims) * 100,
    },
  }
}
