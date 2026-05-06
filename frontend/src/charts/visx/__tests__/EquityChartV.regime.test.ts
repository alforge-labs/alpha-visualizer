import { describe, it, expect } from 'vitest'
import { buildRegimeBands } from '../regimeBands'

describe('buildRegimeBands', () => {
  it('returns empty array for empty input', () => {
    expect(buildRegimeBands([])).toEqual([])
  })

  it('returns single band for uniform states', () => {
    expect(buildRegimeBands([1, 1, 1])).toEqual([
      { state: 1, startIdx: 0, endIdx: 2 },
    ])
  })

  it('aggregates contiguous equal states into bands with inclusive boundaries', () => {
    expect(buildRegimeBands([0, 0, 1, 1, 1, 0])).toEqual([
      { state: 0, startIdx: 0, endIdx: 1 },
      { state: 1, startIdx: 2, endIdx: 4 },
      { state: 0, startIdx: 5, endIdx: 5 },
    ])
  })

  it('handles alternating states', () => {
    expect(buildRegimeBands([0, 1, 0, 1])).toEqual([
      { state: 0, startIdx: 0, endIdx: 0 },
      { state: 1, startIdx: 1, endIdx: 1 },
      { state: 0, startIdx: 2, endIdx: 2 },
      { state: 1, startIdx: 3, endIdx: 3 },
    ])
  })

  it('supports multi-state regimes (n_components > 2)', () => {
    expect(buildRegimeBands([0, 0, 2, 1, 1, 2])).toEqual([
      { state: 0, startIdx: 0, endIdx: 1 },
      { state: 2, startIdx: 2, endIdx: 2 },
      { state: 1, startIdx: 3, endIdx: 4 },
      { state: 2, startIdx: 5, endIdx: 5 },
    ])
  })
})
