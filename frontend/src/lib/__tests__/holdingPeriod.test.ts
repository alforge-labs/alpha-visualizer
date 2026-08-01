import { describe, it, expect } from 'vitest'
import { computeHoldingBins } from '../holdingPeriod'

/**
 * issue #372: holding_days は全取引に保持されているのに保有期間分布が
 * 見えなかった。ビン集計（件数・勝率・平均リターン）の純関数を固定する。
 */
function t(holding_days: number, return_pct: number) {
  return { holding_days, return_pct }
}

describe('computeHoldingBins (issue #372)', () => {
  it('境界値を正しいビンに割り当てる', () => {
    const bins = computeHoldingBins([t(1, 1), t(2, 1), t(3, 1), t(4, 1), t(7, 1), t(8, 1), t(61, 1)])
    const byLabel = Object.fromEntries(bins.map((b) => [b.label, b.count]))
    expect(byLabel['≤1d']).toBe(1)
    expect(byLabel['2–3d']).toBe(2)
    expect(byLabel['4–7d']).toBe(2)
    expect(byLabel['8–14d']).toBe(1)
    expect(byLabel['61d+']).toBe(1)
  })

  it('ビンごとの勝率と平均リターンを算出する', () => {
    const bins = computeHoldingBins([t(2, 4), t(3, -2), t(2, 1)])
    const bin = bins.find((b) => b.label === '2–3d')!
    expect(bin.count).toBe(3)
    expect(bin.winRate).toBeCloseTo((2 / 3) * 100, 5)
    expect(bin.avgReturnPct).toBeCloseTo(1, 5)
  })

  it('末尾の空ビンは落とし、間の空ビンは保持する', () => {
    const bins = computeHoldingBins([t(1, 1), t(10, -1)])
    expect(bins.map((b) => b.label)).toEqual(['≤1d', '2–3d', '4–7d', '8–14d'])
  })

  it('取引が無ければ空配列', () => {
    expect(computeHoldingBins([])).toEqual([])
  })
})
