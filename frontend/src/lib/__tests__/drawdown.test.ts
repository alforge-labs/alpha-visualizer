import { describe, expect, it } from 'vitest'
import { detectTopDrawdowns } from '../drawdown'

describe('detectTopDrawdowns', () => {
  it('returns empty for empty input', () => {
    expect(detectTopDrawdowns([], [])).toEqual([])
  })

  it('skips drawdowns shallower than -1%', () => {
    // -0.5% は閾値内 → ドローダウンとして検出しない
    const dd = [0, -0.005, -0.003, 0]
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']
    expect(detectTopDrawdowns(dd, dates)).toEqual([])
  })

  it('detects single drawdown with recovery', () => {
    const dd = [0, -0.05, -0.10, -0.07, 0]
    const dates = ['d1', 'd2', 'd3', 'd4', 'd5']
    const result = detectTopDrawdowns(dd, dates)
    expect(result).toHaveLength(1)
    const p = result[0]!
    expect(p.depth).toBeCloseTo(-0.10)
    expect(p.startIdx).toBe(1)
    expect(p.peakIdx).toBe(2)
    expect(p.endIdx).toBe(4)
    expect(p.recoveryDays).toBe(2)  // peak から end まで
  })

  it('marks unrecovered drawdown with null recoveryDays', () => {
    // 末尾まで回復しない
    const dd = [0, -0.05, -0.10, -0.08]
    const dates = ['d1', 'd2', 'd3', 'd4']
    const result = detectTopDrawdowns(dd, dates)
    expect(result).toHaveLength(1)
    expect(result[0]?.recoveryDays).toBeNull()
  })

  it('detects multiple periods and sorts deepest first', () => {
    const dd = [0, -0.03, 0, -0.05, -0.08, 0, -0.02, 0]
    const dates = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']
    const result = detectTopDrawdowns(dd, dates)
    // 検出される 3 期間（最初: -0.03 以下/単発・第二: -0.08 / 第三: -0.02 は閾値内なので無視）
    // 実際の閾値判定は -0.01 未満なので -0.03/-0.05 は深い、-0.02 も検出される
    expect(result.length).toBeGreaterThanOrEqual(2)
    // 最深が先頭
    expect(result[0]!.depth).toBeLessThanOrEqual(result[1]!.depth)
    expect(result[0]!.depth).toBeCloseTo(-0.08)
  })

  it('limits results to top N', () => {
    // 5 個の独立した dd 期間を作る
    const dd: number[] = []
    for (let i = 0; i < 5; i++) {
      dd.push(0, -0.05 - i * 0.01, 0)
    }
    const dates = dd.map((_, i) => `d${i}`)
    const result = detectTopDrawdowns(dd, dates, 3)
    expect(result).toHaveLength(3)
  })

  it('does not mutate input', () => {
    const dd = [0, -0.05, 0]
    const dates = ['a', 'b', 'c']
    const ddSnap = [...dd]
    const datesSnap = [...dates]
    detectTopDrawdowns(dd, dates)
    expect(dd).toEqual(ddSnap)
    expect(dates).toEqual(datesSnap)
  })
})
