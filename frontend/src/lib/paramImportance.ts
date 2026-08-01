/**
 * 最適化パラメータの重要度（issue #380）。
 *
 * 各数値パラメータと trial の metric の Spearman 順位相関 ρ を計算し、
 * |ρ| を「結果への効き方の強さ」の目安として返す純粋関数
 * （Optuna Dashboard の param importances の軽量版。因果ではなく
 * 単調関連の指標である点は表示側で注記する）。
 */

export interface ParamImportance {
  param: string
  /** Spearman ρ（符号つき。正 = 大きいほど metric が高い傾向） */
  rho: number
  /** |ρ|（並べ替え・バー長に使う） */
  abs: number
  /** 標本数（数値として解釈できた trial 数） */
  n: number
}

interface TrialLike {
  params: Record<string, unknown>
  metric: number
}

/** 同順位は平均順位（Spearman の標準的なタイ処理） */
function ranks(values: readonly number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => a.v - b.v)
  const out = new Array<number>(values.length)
  let pos = 0
  while (pos < indexed.length) {
    let end = pos
    while (end + 1 < indexed.length && indexed[end + 1]!.v === indexed[pos]!.v) end++
    const avgRank = (pos + end) / 2 + 1
    for (let k = pos; k <= end; k++) out[indexed[k]!.i] = avgRank
    pos = end + 1
  }
  return out
}

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    const dy = ys[i]! - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return 0
  return cov / Math.sqrt(vx * vy)
}

export function computeParamImportance(trials: readonly TrialLike[]): ParamImportance[] {
  if (trials.length < 3) return []
  const paramNames = new Set<string>()
  for (const t of trials) for (const k of Object.keys(t.params)) paramNames.add(k)

  const out: ParamImportance[] = []
  for (const param of paramNames) {
    const xs: number[] = []
    const ys: number[] = []
    for (const t of trials) {
      const raw = t.params[param]
      const v = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(v) || !Number.isFinite(t.metric)) continue
      xs.push(v)
      ys.push(t.metric)
    }
    if (xs.length < 3) continue
    // 値が 1 種類しかないパラメータは効き方を測れない
    if (new Set(xs).size < 2) continue
    const rho = pearson(ranks(xs), ranks(ys))
    out.push({ param, rho, abs: Math.abs(rho), n: xs.length })
  }
  return out.sort((a, b) => b.abs - a.abs)
}
