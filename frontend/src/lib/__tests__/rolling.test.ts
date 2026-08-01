import { describe, expect, it } from 'vitest'
import { computeRollingSharpe } from '../rolling'

describe('computeRollingSharpe', () => {
  it('returns all-null for empty input', () => {
    expect(computeRollingSharpe([], 30)).toEqual([])
  })

  it('returns all-null when window > length', () => {
    const result = computeRollingSharpe([0.01, 0.02, -0.01], 30)
    expect(result).toHaveLength(3)
    expect(result.every(v => v === null)).toBe(true)
  })

  it('first window-1 entries are null', () => {
    const result = computeRollingSharpe([0.01, 0.02, -0.005, 0.015, 0.0], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).not.toBeNull()
  })

  it('returns 0 when std is 0 (constant returns)', () => {
    // 全て同値 → 標本分散 0 → Sharpe = 0
    const result = computeRollingSharpe([0.01, 0.01, 0.01, 0.01], 3)
    expect(result[2]).toBe(0)
    expect(result[3]).toBe(0)
  })

  it('annualizes by sqrt(252)', () => {
    // mean=0.01, std=0.01 → daily Sharpe=1, 年率化=sqrt(252)
    const result = computeRollingSharpe([0.0, 0.02, 0.0, 0.02], 4)
    const last = result[3]
    expect(last).not.toBeNull()
    // mean=0.01, std=0.01154 → daily=0.866, 年率=0.866*sqrt(252)≈13.74
    expect(last!).toBeGreaterThan(13)
    expect(last!).toBeLessThan(15)
  })

  it('does not mutate input', () => {
    const input = [0.01, 0.02, -0.01, 0.005]
    const snapshot = [...input]
    computeRollingSharpe(input, 3)
    expect(input).toEqual(snapshot)
  })
})

describe('computeRollingVolatility (issue #376)', () => {
  it('window 未満は null、以降は年率化ボラティリティ（%）を返す', async () => {
    const { computeRollingVolatility } = await import('../rolling')
    const result = computeRollingVolatility([0.01, -0.01, 0.01], 2)
    expect(result[0]).toBeNull()
    // std([0.01, -0.01]) = 0.0141421…（標本標準偏差）→ ×√252×100
    expect(result[1]).toBeCloseTo(0.014142135 * Math.sqrt(252) * 100, 3)
  })

  it('一定リターンではボラティリティ 0', async () => {
    const { computeRollingVolatility } = await import('../rolling')
    const result = computeRollingVolatility([0.01, 0.01, 0.01], 2)
    expect(result[1]).toBe(0)
    expect(result[2]).toBe(0)
  })

  it('window が系列長を超える場合はすべて null', async () => {
    const { computeRollingVolatility } = await import('../rolling')
    expect(computeRollingVolatility([0.01], 5)).toEqual([null])
  })
})
