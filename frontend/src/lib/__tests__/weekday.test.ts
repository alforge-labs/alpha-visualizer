import { describe, expect, it } from 'vitest'
import { computeWeekdayStats } from '../weekday'

const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

describe('computeWeekdayStats', () => {
  it('returns labels with zero stats when no data', () => {
    const result = computeWeekdayStats([], [], LABELS)
    expect(result).toHaveLength(5)
    expect(result.every(s => s.count === 0)).toBe(true)
    expect(result.every(s => s.avg === 0)).toBe(true)
    expect(result.every(s => s.winRate === 0)).toBe(true)
  })

  it('aggregates returns by weekday', () => {
    // 月曜=2026-04-06, 火曜=2026-04-07
    // dates[0] は基準日（returns[0] は dates[1] のリターン扱い）
    const dates = ['2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08']
    const returns = [0.01, -0.005, 0.02]
    const result = computeWeekdayStats(returns, dates, LABELS)
    // dates[1]=2026-04-06 (Mon), dates[2]=2026-04-07 (Tue), dates[3]=2026-04-08 (Wed)
    expect(result[0]).toEqual({ day: 'Mon', avg: 0.01, count: 1, winRate: 100 })
    expect(result[1]).toEqual({ day: 'Tue', avg: -0.005, count: 1, winRate: 0 })
    expect(result[2]).toEqual({ day: 'Wed', avg: 0.02, count: 1, winRate: 100 })
    expect(result[3]?.count).toBe(0)
    expect(result[4]?.count).toBe(0)
  })

  it('skips weekends (Sat=6 / Sun=0 are out of range)', () => {
    const dates = ['x', '2026-04-04', '2026-04-05'] // Sat, Sun
    const returns = [0.01, 0.02]
    const result = computeWeekdayStats(returns, dates, LABELS)
    expect(result.every(s => s.count === 0)).toBe(true)
  })

  it('skips invalid date strings', () => {
    const dates = ['x', 'invalid-date', '2026-04-06']
    const returns = [0.01, 0.02]
    const result = computeWeekdayStats(returns, dates, LABELS)
    // Mon が 1 件のみ（invalid はスキップ）
    expect(result[0]?.count).toBe(1)
    expect(result[0]?.avg).toBe(0.02)
  })

  it('computes win rate correctly for mixed signs', () => {
    // 月曜が 4 件: 3 勝 1 敗 → 75%
    const dates = ['x', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27']
    const returns = [0.01, 0.02, -0.005, 0.015]
    const result = computeWeekdayStats(returns, dates, LABELS)
    expect(result[0]?.count).toBe(4)
    expect(result[0]?.winRate).toBe(75)
  })
})
