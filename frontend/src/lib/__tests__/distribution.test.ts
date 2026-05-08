import { describe, expect, it } from 'vitest'
import {
  computeHistogram,
  mean,
  normalPdf,
  sampleStd,
} from '../distribution'

describe('computeHistogram', () => {
  it('returns empty array for empty input', () => {
    expect(computeHistogram([], { binCount: 10 })).toEqual([])
  })

  it('places each value into the correct bucket', () => {
    const buckets = computeHistogram([0, 0, 0, 1, 1, 2], { binCount: 3 })
    expect(buckets.length).toBe(3)
    expect(buckets[0]?.count).toBe(3)
    expect(buckets[1]?.count).toBe(2)
    expect(buckets[2]?.count).toBe(1)
  })

  it('respects domainMin / domainMax overrides', () => {
    const buckets = computeHistogram([-1, -0.5, 0], {
      binCount: 4,
      domainMin: -2,
      domainMax: 0,
    })
    // 範囲は [-2, 0], width = 0.5, バケット数 = 4
    expect(buckets[0]?.x).toBeCloseTo(-1.75)
    expect(buckets[3]?.x).toBeCloseTo(-0.25)
    expect(buckets.reduce((a, b) => a + b.count, 0)).toBe(3)
  })

  it('handles zero range (all values equal) without divide-by-zero', () => {
    const buckets = computeHistogram([1, 1, 1], { binCount: 5 })
    // すべて同じ値 → width=0.01 fallback、全部最初のバケットに集まる
    expect(buckets.length).toBe(5)
    expect(buckets[0]?.count).toBe(3)
  })
})

describe('normalPdf', () => {
  it('peaks at the mean', () => {
    const peak = normalPdf(0, 0, 1)
    const off = normalPdf(1, 0, 1)
    expect(peak).toBeGreaterThan(off)
  })

  it('returns 0 when std is 0 (avoid divide-by-zero)', () => {
    expect(normalPdf(1.0, 0.0, 0)).toBe(0)
  })

  it('matches the standard normal value at x=0', () => {
    // 1 / sqrt(2π) ≈ 0.3989
    expect(normalPdf(0, 0, 1)).toBeCloseTo(0.3989, 3)
  })
})

describe('mean / sampleStd', () => {
  it('mean handles empty array', () => {
    expect(mean([])).toBe(0)
  })

  it('mean computes arithmetic average', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  it('sampleStd returns 0 for length < 2', () => {
    expect(sampleStd([])).toBe(0)
    expect(sampleStd([5])).toBe(0)
  })

  it('sampleStd uses n-1 denominator', () => {
    // [1, 2, 3] mean=2, deviations=[-1,0,1], sse=2, /(n-1=2)=1, sqrt=1
    expect(sampleStd([1, 2, 3])).toBeCloseTo(1, 6)
  })
})
