/**
 * 任意ベンチマーク比較（issue #370）。
 *
 * ベンチマーク銘柄の OHLC（close）を戦略 equity の日付列に整列し、
 * 正規化オーバーレイ系列と対ベンチ指標（β / 年率 α / IR / 超過リターン）を
 * フロント側で計算する純粋関数。
 */

export interface BenchmarkComparison {
  /** equityDates と同じ長さ。戦略の開始値に正規化済み（欠損日は前方フィル） */
  benchmarkEquity: number[]
  /** 両系列のリターンが揃った日数（統計の標本数） */
  alignedDays: number
  beta: number
  /** 年率換算 α（%）。日次 α × 252 × 100 */
  alphaPct: number
  /** Information Ratio（年率化） */
  informationRatio: number
  /** 期間合計の超過リターン（戦略 − ベンチ・%pt） */
  excessReturnPct: number
}

interface BenchBar {
  time: string
  close: number
}

interface CompareInput {
  equityDates: readonly string[]
  equityValues: readonly number[]
  benchBars: readonly BenchBar[]
}

const ANNUALIZATION = Math.sqrt(252)

export function compareWithBenchmark(input: CompareInput): BenchmarkComparison | null {
  const { equityDates, equityValues, benchBars } = input
  if (equityDates.length < 2 || equityDates.length !== equityValues.length) return null

  const closeByDate = new Map<string, number>()
  for (const b of benchBars) {
    if (Number.isFinite(b.close) && b.close > 0) closeByDate.set(b.time.slice(0, 10), b.close)
  }
  if (closeByDate.size === 0) return null

  // equity 日付列に沿って close を前方フィルで整列。先頭の欠損は最初の
  // 実在値で埋める（オーバーレイを equity と同じ長さにするため）
  const aligned: (number | null)[] = []
  let last: number | null = null
  for (const d of equityDates) {
    const v = closeByDate.get(d.slice(0, 10))
    if (v != null) last = v
    aligned.push(last)
  }
  const firstKnown = aligned.find((v): v is number => v != null)
  if (firstKnown == null) return null
  const closes = aligned.map((v) => v ?? firstKnown)

  // 統計は前方フィル後の系列で全営業日のリターンを取る（ベンチの欠損日は
  // リターン 0 扱い。休場日ずれのある銘柄同士でも標本を確保できる）
  const rs: number[] = []
  const rb: number[] = []
  for (let i = 1; i < equityDates.length; i++) {
    const es = equityValues[i - 1]!
    const bs = closes[i - 1]!
    if (es === 0 || bs === 0) continue
    rs.push(equityValues[i]! / es - 1)
    rb.push(closes[i]! / bs - 1)
  }
  if (rs.length < 2) return null

  const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
  const ms = mean(rs)
  const mb = mean(rb)
  let cov = 0
  let varB = 0
  for (let i = 0; i < rs.length; i++) {
    cov += (rs[i]! - ms) * (rb[i]! - mb)
    varB += (rb[i]! - mb) ** 2
  }
  cov /= rs.length - 1
  varB /= rs.length - 1
  if (varB === 0) return null
  const beta = cov / varB
  const alphaDaily = ms - beta * mb

  const diffs = rs.map((r, i) => r - rb[i]!)
  const md = mean(diffs)
  const varD = diffs.reduce((a, b) => a + (b - md) ** 2, 0) / (diffs.length - 1)
  const stdD = Math.sqrt(varD)

  const base = equityValues[0]!
  const benchmarkEquity = closes.map((c) => (base * c) / closes[0]!)

  const strategyTotal = (equityValues[equityValues.length - 1]! / base - 1) * 100
  const benchTotal = (closes[closes.length - 1]! / closes[0]! - 1) * 100

  return {
    benchmarkEquity,
    alignedDays: rs.length,
    beta,
    alphaPct: alphaDaily * 252 * 100,
    informationRatio: stdD === 0 ? 0 : (md / stdD) * ANNUALIZATION,
    excessReturnPct: strategyTotal - benchTotal,
  }
}
