/**
 * 保有期間分布の集計（issue #372）。
 *
 * per-trade の holding_days をビンに分け、件数・勝率・平均リターンを返す
 * 純粋関数。チャート（HoldingPeriodChart）とデータ表の両方から使う。
 */

export interface HoldingBin {
  label: string
  count: number
  wins: number
  /** 勝率（%）。count = 0 のとき 0 */
  winRate: number
  /** 平均リターン（%）。count = 0 のとき 0 */
  avgReturnPct: number
}

interface TradeLike {
  holding_days: number
  return_pct: number
}

/** ビン境界（上限日数, ラベル）。最後は無限大 */
const BIN_DEFS: ReadonlyArray<readonly [number, string]> = [
  [1, '≤1d'],
  [3, '2–3d'],
  [7, '4–7d'],
  [14, '8–14d'],
  [30, '15–30d'],
  [60, '31–60d'],
  [Number.POSITIVE_INFINITY, '61d+'],
]

/**
 * holding_days をビン集計する。
 *
 * - 末尾の空ビンは落とす（長期ビンが常に並ぶノイズを避ける）
 * - 間の空ビンは保持する（分布の谷が見えるように）
 * - 取引が無ければ空配列
 */
export function computeHoldingBins(trades: readonly TradeLike[]): HoldingBin[] {
  if (trades.length === 0) return []
  const acc = BIN_DEFS.map(() => ({ count: 0, wins: 0, totalReturn: 0 }))
  for (const t of trades) {
    const days = t.holding_days
    if (!Number.isFinite(days)) continue
    const idx = BIN_DEFS.findIndex(([max]) => days <= max)
    const bin = acc[idx === -1 ? acc.length - 1 : idx]!
    bin.count += 1
    if (t.return_pct > 0) bin.wins += 1
    bin.totalReturn += t.return_pct
  }
  let lastNonEmpty = -1
  acc.forEach((b, i) => {
    if (b.count > 0) lastNonEmpty = i
  })
  return acc.slice(0, lastNonEmpty + 1).map((b, i) => ({
    label: BIN_DEFS[i]![1],
    count: b.count,
    wins: b.wins,
    winRate: b.count > 0 ? (b.wins / b.count) * 100 : 0,
    avgReturnPct: b.count > 0 ? b.totalReturn / b.count : 0,
  }))
}
