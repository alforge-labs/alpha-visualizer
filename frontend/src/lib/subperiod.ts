/**
 * サブピリオド（選択期間）指標の再計算（issue #377）。
 *
 * 日次リターンと equity から、選択期間の主要指標をフロント側で再計算する
 * 純粋関数。取引ベースの指標（勝率・PF 等）は per-trade データの期間割当が
 * 必要なため対象外。
 */

export type SubperiodPreset = '1y' | '3y' | '5y' | 'ytd'

export interface SubperiodMetricsResult {
  /** 期間内の総リターン（%） */
  totalReturnPct: number
  /** 期間内の最大ドローダウン（%・負値） */
  maxDrawdownPct: number
  /** 年率化 Sharpe（rf=0） */
  sharpe: number
  /** 年率化ボラティリティ（%） */
  volatilityPct: number
  /** 期間内のデータ点数（日数） */
  days: number
  /** 期間の開始日（実データ上の最初の日付） */
  startDate: string
}

const ANNUALIZATION = Math.sqrt(252)

/** プリセットから開始日（ISO 日付）を求める。基準は系列の最終日 */
export function presetStartDate(preset: SubperiodPreset, lastDate: string): string {
  if (preset === 'ytd') return `${lastDate.slice(0, 4)}-01-01`
  const years = preset === '1y' ? 1 : preset === '3y' ? 3 : 5
  const year = Number(lastDate.slice(0, 4)) - years
  return `${year}${lastDate.slice(4)}`
}

interface SubperiodInput {
  dates: readonly string[]
  equity: readonly number[]
  /** 日次リターン (decimal)。``returns[i]`` は ``dates[i+1]`` のリターン */
  returns: readonly number[]
  /** この日付以降（ISO 比較）を対象にする */
  fromDate: string
}

/**
 * ``fromDate`` 以降の equity / リターンから主要指標を再計算する。
 * 範囲内のデータ点が 2 未満なら ``null``。
 */
export function computeSubperiodMetrics(
  input: SubperiodInput,
): SubperiodMetricsResult | null {
  const { dates, equity, returns, fromDate } = input
  const startIdx = dates.findIndex((d) => d >= fromDate)
  if (startIdx === -1) return null
  const eq = equity.slice(startIdx)
  if (eq.length < 2) return null
  // returns[i] は dates[i+1] のリターン。範囲初日のリターンは範囲外株価
  // 由来のため含めない（startIdx 日以降のリターン = returns[startIdx..]）
  const rets = returns.slice(startIdx)

  const first = eq[0]!
  const last = eq[eq.length - 1]!
  const totalReturnPct = first !== 0 ? (last / first - 1) * 100 : 0

  let peak = Number.NEGATIVE_INFINITY
  let maxDd = 0
  for (const v of eq) {
    peak = Math.max(peak, v)
    if (peak > 0) maxDd = Math.min(maxDd, (v / peak - 1) * 100)
  }

  let sharpe = 0
  let volatilityPct = 0
  if (rets.length >= 2) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const variance =
      rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)
    const std = Math.sqrt(variance)
    sharpe = std === 0 ? 0 : (mean / std) * ANNUALIZATION
    volatilityPct = std * ANNUALIZATION * 100
  }

  return {
    totalReturnPct,
    maxDrawdownPct: maxDd,
    sharpe,
    volatilityPct,
    days: eq.length,
    startDate: dates[startIdx]!,
  }
}
