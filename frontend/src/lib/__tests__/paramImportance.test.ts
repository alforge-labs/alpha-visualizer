import { describe, it, expect } from 'vitest'
import { computeParamImportance } from '../paramImportance'

/**
 * issue #380: 「どのパラメータが結果を支配しているか」の要約が無かった。
 * Spearman 順位相関 |ρ| による重要度の純関数を固定する。
 */
function trial(params: Record<string, unknown>, metric: number) {
  return { params, metric }
}

describe('computeParamImportance (issue #380)', () => {
  it('単調に効くパラメータは |ρ| ≈ 1・逆相関は ρ < 0', () => {
    const trials = [
      trial({ period: 10, threshold: 5 }, 0.1),
      trial({ period: 20, threshold: 4 }, 0.2),
      trial({ period: 30, threshold: 3 }, 0.3),
      trial({ period: 40, threshold: 2 }, 0.4),
    ]
    const result = computeParamImportance(trials)
    const period = result.find((r) => r.param === 'period')!
    const threshold = result.find((r) => r.param === 'threshold')!
    expect(period.rho).toBeCloseTo(1, 6)
    expect(threshold.rho).toBeCloseTo(-1, 6)
    // |ρ| 降順
    expect(result[0]!.abs).toBeGreaterThanOrEqual(result[result.length - 1]!.abs)
  })

  it('値が 1 種類しかないパラメータと非数値パラメータは除外', () => {
    const trials = [
      trial({ fixed: 5, mode: 'a', period: 1 }, 0.1),
      trial({ fixed: 5, mode: 'b', period: 2 }, 0.2),
      trial({ fixed: 5, mode: 'a', period: 3 }, 0.3),
    ]
    const result = computeParamImportance(trials)
    expect(result.map((r) => r.param)).toEqual(['period'])
  })

  it('trial が 3 件未満なら空（相関が意味を持たない）', () => {
    expect(computeParamImportance([trial({ p: 1 }, 0.1), trial({ p: 2 }, 0.2)])).toEqual([])
  })

  it('同順位（タイ）は平均順位で扱う', () => {
    const trials = [
      trial({ p: 1 }, 0.1),
      trial({ p: 1 }, 0.2),
      trial({ p: 2 }, 0.3),
      trial({ p: 3 }, 0.4),
    ]
    const result = computeParamImportance(trials)
    expect(result[0]!.rho).toBeGreaterThan(0.8)
    expect(Number.isFinite(result[0]!.rho)).toBe(true)
  })
})
