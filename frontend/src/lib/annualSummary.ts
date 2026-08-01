/**
 * 年別サマリテーブルの行を組み立てる純粋関数（issue #383）。
 *
 * annual_returns（年→%）を軸に、ベンチマーク年次リターン・年次 MaxDD
 * （forge metrics の annual_max_drawdown・負数 %）・取引数・勝率を年ごとに
 * まとめる。欠損は null（表示側で「—」）。
 */

export interface AnnualSummaryRow {
  year: string
  returnPct: number
  benchReturnPct: number | null
  /** 戦略 − ベンチ（ベンチ欠損時は null） */
  excessPct: number | null
  maxDdPct: number | null
  tradeCount: number
  /** その年の取引がゼロなら null */
  winRatePct: number | null
}

interface TradeLike {
  exit_date?: string | null
  return_pct: number
}

interface AnnualSummaryInput {
  annualReturns: Record<string, number>
  benchmarkReturns?: Record<string, number> | null
  annualMaxDrawdown?: Record<string, number> | null
  trades?: readonly TradeLike[]
}

export function buildAnnualSummary(input: AnnualSummaryInput): AnnualSummaryRow[] {
  const { annualReturns, benchmarkReturns, annualMaxDrawdown, trades } = input
  const byYear = new Map<string, { count: number; wins: number }>()
  for (const t of trades ?? []) {
    const year = t.exit_date?.slice(0, 4)
    if (!year) continue
    const acc = byYear.get(year) ?? { count: 0, wins: 0 }
    acc.count += 1
    if (t.return_pct > 0) acc.wins += 1
    byYear.set(year, acc)
  }
  return Object.keys(annualReturns)
    .sort()
    .map((year) => {
      const bench = benchmarkReturns?.[year] ?? null
      const ret = annualReturns[year]!
      const tradeAcc = byYear.get(year)
      return {
        year,
        returnPct: ret,
        benchReturnPct: bench,
        excessPct: bench != null ? ret - bench : null,
        maxDdPct: annualMaxDrawdown?.[year] ?? null,
        tradeCount: tradeAcc?.count ?? 0,
        winRatePct: tradeAcc && tradeAcc.count > 0 ? (tradeAcc.wins / tradeAcc.count) * 100 : null,
      }
    })
}
