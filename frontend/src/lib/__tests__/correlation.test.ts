import { describe, it, expect } from 'vitest'
import { pearsonCorrelation, correlationMatrix } from '../correlation'

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly positively correlated series', () => {
    const a = [1, 2, 3, 4, 5]
    const b = [2, 4, 6, 8, 10]
    const r = pearsonCorrelation(a, b)
    expect(r).not.toBeNull()
    expect(r!).toBeCloseTo(1, 6)
  })

  it('returns -1 for perfectly negatively correlated series', () => {
    const a = [1, 2, 3, 4, 5]
    const b = [10, 8, 6, 4, 2]
    const r = pearsonCorrelation(a, b)
    expect(r).not.toBeNull()
    expect(r!).toBeCloseTo(-1, 6)
  })

  it('returns ~0 for uncorrelated series', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const b = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3]
    const r = pearsonCorrelation(a, b)
    expect(r).not.toBeNull()
    expect(Math.abs(r!)).toBeLessThan(0.4)
  })

  it('aligns to the shorter length using the trailing window', () => {
    const a = [100, 100, 100, 1, 2, 3, 4, 5]
    const b = [2, 4, 6, 8, 10]
    const r = pearsonCorrelation(a, b)
    expect(r).not.toBeNull()
    // Last 5 elements of `a` are [1, 2, 3, 4, 5] which perfectly correlates with b
    expect(r!).toBeCloseTo(1, 6)
  })

  it('returns null when one of the series has zero variance', () => {
    const a = [1, 1, 1, 1]
    const b = [1, 2, 3, 4]
    expect(pearsonCorrelation(a, b)).toBeNull()
  })

  it('returns null when one of the series is empty', () => {
    expect(pearsonCorrelation([], [1, 2, 3])).toBeNull()
    expect(pearsonCorrelation([1, 2, 3], [])).toBeNull()
  })

  it('returns null when overlap length is too small for a meaningful correlation', () => {
    expect(pearsonCorrelation([1], [2])).toBeNull()
  })

  it('ignores NaN values consistently', () => {
    const a = [1, 2, 3, 4, 5]
    const b = [NaN, 4, 6, 8, 10]
    const r = pearsonCorrelation(a, b)
    expect(r).not.toBeNull()
    // After dropping the NaN-aligned pair, [2,3,4,5] vs [4,6,8,10] is still r=1
    expect(r!).toBeCloseTo(1, 6)
  })
})

describe('correlationMatrix', () => {
  it('returns an N x N matrix with diagonal of 1', () => {
    const a = [1, 2, 3, 4, 5]
    const b = [2, 4, 6, 8, 10]
    const c = [5, 4, 3, 2, 1]
    const m = correlationMatrix([a, b, c])
    expect(m.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(m[i]!.length).toBe(3)
      expect(m[i]![i]).toBeCloseTo(1, 6)
    }
  })

  it('produces a symmetric matrix', () => {
    const series = [
      [1, 2, 3, 4, 5],
      [3, 1, 4, 1, 5],
      [9, 2, 6, 5, 3],
    ]
    const m = correlationMatrix(series)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const a = m[i]![j]
        const b = m[j]![i]
        if (a == null || b == null) {
          expect(a).toBe(b)
        } else {
          expect(a).toBeCloseTo(b, 6)
        }
      }
    }
  })

  it('emits null cells when a pair cannot be correlated', () => {
    const m = correlationMatrix([
      [1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5],
    ])
    expect(m[0]![1]).toBeNull()
    expect(m[1]![0]).toBeNull()
    // Diagonal of a zero-variance series is also undefined
    expect(m[0]![0]).toBeNull()
    expect(m[1]![1]).toBeCloseTo(1, 6)
  })

  it('handles empty input', () => {
    expect(correlationMatrix([])).toEqual([])
  })
})
