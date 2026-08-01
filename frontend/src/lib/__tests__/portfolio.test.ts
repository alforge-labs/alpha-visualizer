import { describe, it, expect } from 'vitest'
import { combinePortfolio } from '../portfolio'

/**
 * issue #375: 相関ヒートマップの先にある「合成したら Sharpe/DD はどうなるか」
 * を確認するための加重合成（毎日リバランス想定）の純関数を固定する。
 */
const A = {
  name: 'A',
  dates: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
  returns: [0.02, -0.01, 0.01], // dates[i+1] のリターン
}
const B = {
  name: 'B',
  dates: ['2025-01-02', '2025-01-03', '2025-01-04'],
  returns: [0.01, 0.03], // 2025-01-03, 2025-01-04
}

describe('combinePortfolio (issue #375)', () => {
  it('共通日付だけで加重リターンを合成する（等ウェイト）', () => {
    const result = combinePortfolio(
      [
        { dates: A.dates, returns: A.returns },
        { dates: B.dates, returns: B.returns },
      ],
      [0.5, 0.5],
    )!
    // 共通リターン日は 01-03 と 01-04 の 2 日
    expect(result.dates).toEqual(['2025-01-03', '2025-01-04'])
    expect(result.returns[0]).toBeCloseTo(0.5 * -0.01 + 0.5 * 0.01, 10)
    expect(result.returns[1]).toBeCloseTo(0.5 * 0.01 + 0.5 * 0.03, 10)
    // equity は 100 起点の累積
    expect(result.equity[0]).toBeCloseTo(100 * (1 + result.returns[0]!), 6)
    // 指標
    expect(result.metrics.totalReturnPct).toBeCloseTo(
      ((1 + result.returns[0]!) * (1 + result.returns[1]!) - 1) * 100,
      6,
    )
    expect(Number.isFinite(result.metrics.sharpe)).toBe(true)
    expect(result.metrics.maxDrawdownPct).toBeLessThanOrEqual(0)
  })

  it('ウェイトは合計で正規化される', () => {
    const r1 = combinePortfolio(
      [
        { dates: A.dates, returns: A.returns },
        { dates: B.dates, returns: B.returns },
      ],
      [2, 2],
    )!
    const r2 = combinePortfolio(
      [
        { dates: A.dates, returns: A.returns },
        { dates: B.dates, returns: B.returns },
      ],
      [1, 1],
    )!
    expect(r1.returns).toEqual(r2.returns)
  })

  it('共通日付が 2 未満なら null', () => {
    const result = combinePortfolio(
      [
        { dates: ['2025-01-01', '2025-01-02'], returns: [0.01] },
        { dates: ['2030-01-01', '2030-01-02'], returns: [0.02] },
      ],
      [1, 1],
    )
    expect(result).toBeNull()
  })
})
