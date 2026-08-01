import { describe, it, expect } from 'vitest'
import { computeSubperiodMetrics, presetStartDate } from '../subperiod'

/**
 * issue #377: 指標グリッドが常に全期間値で、「直近 N 年だけの実力」を
 * 見る手段がなかった。日次リターン + equity から選択期間の主要指標を
 * フロント側で再計算する純関数を固定する。
 */
describe('presetStartDate (issue #377)', () => {
  it('1Y/3Y/5Y は末尾日付から年数を引いた日付、YTD は年初を返す', () => {
    expect(presetStartDate('1y', '2025-07-15')).toBe('2024-07-15')
    expect(presetStartDate('3y', '2025-07-15')).toBe('2022-07-15')
    expect(presetStartDate('5y', '2025-07-15')).toBe('2020-07-15')
    expect(presetStartDate('ytd', '2025-07-15')).toBe('2025-01-01')
  })
})

describe('computeSubperiodMetrics (issue #377)', () => {
  // equity: 100 → 110 → 99 → 108.9（日次リターン +10%, -10%, +10%）
  const dates = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04']
  const equity = [100, 110, 99, 108.9]
  const returns = [0.1, -0.1, 0.1]

  it('選択範囲の総リターン・最大DD・年率ボラを算出する', () => {
    const m = computeSubperiodMetrics({ dates, equity, returns, fromDate: '2025-01-01' })!
    expect(m.totalReturnPct).toBeCloseTo(8.9, 5)
    // ピーク 110 → 谷 99 の -10%
    expect(m.maxDrawdownPct).toBeCloseTo(-10, 5)
    expect(m.days).toBe(4)
    expect(m.volatilityPct).toBeGreaterThan(0)
    expect(Number.isFinite(m.sharpe)).toBe(true)
  })

  it('fromDate 以降だけを対象にする', () => {
    const m = computeSubperiodMetrics({ dates, equity, returns, fromDate: '2025-01-03' })!
    // 99 → 108.9 の +10%
    expect(m.totalReturnPct).toBeCloseTo(10, 5)
    expect(m.days).toBe(2)
  })

  it('範囲内に点が 2 未満なら null', () => {
    expect(
      computeSubperiodMetrics({ dates, equity, returns, fromDate: '2025-01-04' }),
    ).toBeNull()
  })
})
