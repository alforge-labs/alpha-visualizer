/**
 * ポートフォリオ合成（issue #375）。
 *
 * 複数戦略の日次リターンを日付で整列し、加重合成（毎日リバランス想定）の
 * リターン・エクイティ・主要指標を計算する純粋関数。
 */

export interface PortfolioSeriesInput {
  /** equity の日付列。``returns[i]`` は ``dates[i+1]`` のリターンとして扱う */
  dates: readonly string[]
  /** 日次リターン (decimal) */
  returns: readonly number[]
}

export interface PortfolioMetrics {
  totalReturnPct: number
  sharpe: number
  volatilityPct: number
  maxDrawdownPct: number
  days: number
}

export interface PortfolioResult {
  dates: string[]
  returns: number[]
  /** 100 起点の累積エクイティ（dates と同じ長さ） */
  equity: number[]
  metrics: PortfolioMetrics
}

const ANNUALIZATION = Math.sqrt(252)

/**
 * 共通日付での加重合成。ウェイトは合計で正規化する。
 * 共通リターン日が 2 未満なら null。
 */
export function combinePortfolio(
  series: readonly PortfolioSeriesInput[],
  weights: readonly number[],
): PortfolioResult | null {
  if (series.length === 0 || series.length !== weights.length) return null
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  if (!(totalWeight > 0)) return null
  const norm = weights.map((w) => w / totalWeight)

  // 各系列を date → return の map に（returns[i] は dates[i+1] のリターン）
  const maps = series.map((s) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.returns.length; i++) {
      const d = s.dates[i + 1]
      if (d) m.set(d, s.returns[i]!)
    }
    return m
  })

  const common = [...maps[0]!.keys()]
    .filter((d) => maps.every((m) => m.has(d)))
    .sort()
  if (common.length < 2) return null

  const returns = common.map((d) =>
    maps.reduce((acc, m, i) => acc + norm[i]! * m.get(d)!, 0),
  )

  const equity: number[] = []
  let value = 100
  let peak = 100
  let maxDd = 0
  for (const r of returns) {
    value *= 1 + r
    equity.push(value)
    peak = Math.max(peak, value)
    if (peak > 0) maxDd = Math.min(maxDd, (value / peak - 1) * 100)
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  const std = Math.sqrt(variance)

  return {
    dates: common,
    returns,
    equity,
    metrics: {
      totalReturnPct: (value / 100 - 1) * 100,
      sharpe: std === 0 ? 0 : (mean / std) * ANNUALIZATION,
      volatilityPct: std * ANNUALIZATION * 100,
      maxDrawdownPct: maxDd,
      days: returns.length,
    },
  }
}
