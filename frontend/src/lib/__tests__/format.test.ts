import { describe, it, expect } from 'vitest'
import {
  fmtNumber,
  fmtSharpe,
  fmtPercent,
  fmtInteger,
  fmtDiff,
  fmtDate,
} from '../format'

describe('fmtNumber', () => {
  it('returns fallback for null / undefined / NaN / Infinity', () => {
    expect(fmtNumber(null)).toBe('—')
    expect(fmtNumber(undefined)).toBe('—')
    expect(fmtNumber(Number.NaN)).toBe('—')
    expect(fmtNumber(Number.POSITIVE_INFINITY)).toBe('—')
    expect(fmtNumber(Number.NEGATIVE_INFINITY)).toBe('—')
  })

  it('uses 3 decimals for |v| < 10 (auto)', () => {
    expect(fmtNumber(0)).toBe('0.000')
    expect(fmtNumber(1.234567)).toBe('1.235')
    expect(fmtNumber(-9.5)).toBe('-9.500')
  })

  it('uses 2 decimals for 10 <= |v| < 100 (auto)', () => {
    expect(fmtNumber(12.345)).toBe('12.35')
    expect(fmtNumber(99.999)).toBe('100.00')
    expect(fmtNumber(-50)).toBe('-50.00')
  })

  it('uses 1 decimal for |v| >= 100 (auto)', () => {
    expect(fmtNumber(100)).toBe('100.0')
    expect(fmtNumber(1234.56)).toBe('1234.6')
    expect(fmtNumber(-987.6)).toBe('-987.6')
  })

  it('honors explicit decimals option', () => {
    expect(fmtNumber(1.23456, { decimals: 0 })).toBe('1')
    expect(fmtNumber(1.23456, { decimals: 4 })).toBe('1.2346')
    expect(fmtNumber(1234.5, { decimals: 3 })).toBe('1234.500')
  })

  it('appends suffix', () => {
    expect(fmtNumber(12.34, { suffix: '%' })).toBe('12.34%')
    expect(fmtNumber(2, { decimals: 2, suffix: 'x' })).toBe('2.00x')
  })

  it('prefixes + for positive when sign=true', () => {
    expect(fmtNumber(1.5, { sign: true })).toBe('+1.500')
    expect(fmtNumber(-1.5, { sign: true })).toBe('-1.500')
  })

  it('does not prefix + for zero when sign=true', () => {
    expect(fmtNumber(0, { sign: true })).toBe('0.000')
  })

  it('honors custom fallback', () => {
    expect(fmtNumber(null, { fallback: 'N/A' })).toBe('N/A')
    expect(fmtNumber(Number.NaN, { fallback: '?' })).toBe('?')
  })
})

describe('fmtSharpe', () => {
  it('forces 2 decimals', () => {
    expect(fmtSharpe(1.23456)).toBe('1.23')
    expect(fmtSharpe(0)).toBe('0.00')
    expect(fmtSharpe(123.456)).toBe('123.46')
  })

  it('returns dash for null/undefined', () => {
    expect(fmtSharpe(null)).toBe('—')
    expect(fmtSharpe(undefined)).toBe('—')
  })
})

describe('fmtPercent', () => {
  it('appends % suffix', () => {
    expect(fmtPercent(12.34)).toBe('12.34%')
    expect(fmtPercent(0.5, { decimals: 2 })).toBe('0.50%')
  })

  it('returns dash for null', () => {
    expect(fmtPercent(null)).toBe('—')
  })
})

describe('fmtInteger', () => {
  it('rounds to nearest integer', () => {
    expect(fmtInteger(3.4)).toBe('3')
    expect(fmtInteger(3.6)).toBe('4')
    expect(fmtInteger(-2.5)).toBe('-2')
    expect(fmtInteger(0)).toBe('0')
  })

  it('returns fallback for null / undefined / non-finite', () => {
    expect(fmtInteger(null)).toBe('—')
    expect(fmtInteger(undefined)).toBe('—')
    expect(fmtInteger(Number.NaN)).toBe('—')
    expect(fmtInteger(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('honors custom fallback', () => {
    expect(fmtInteger(null, 'N/A')).toBe('N/A')
  })
})

describe('fmtDiff', () => {
  it('prefixes + for positive', () => {
    expect(fmtDiff(1.234, '%')).toBe('+1.234%')
    expect(fmtDiff(15)).toBe('+15.00')
    expect(fmtDiff(150)).toBe('+150.0')
  })

  it('keeps minus for negative', () => {
    expect(fmtDiff(-1.234, '%')).toBe('-1.234%')
    expect(fmtDiff(-15)).toBe('-15.00')
  })

  it('does not prefix + for zero', () => {
    expect(fmtDiff(0)).toBe('0.000')
  })

  it('returns dash for null / undefined', () => {
    expect(fmtDiff(null)).toBe('—')
    expect(fmtDiff(undefined)).toBe('—')
  })
})

describe('fmtDate', () => {
  it('extracts the YYYY-MM-DD portion of an ISO timestamp', () => {
    expect(fmtDate('2024-01-15T12:34:56Z')).toBe('2024-01-15')
    expect(fmtDate('2024-01-15T00:00:00')).toBe('2024-01-15')
  })

  it('returns ISO date as-is when no T separator', () => {
    expect(fmtDate('2024-01-15')).toBe('2024-01-15')
  })

  it('returns fallback for null / undefined / empty string', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
    expect(fmtDate('')).toBe('—')
  })

  it('honors custom fallback', () => {
    expect(fmtDate(null, 'never')).toBe('never')
  })
})
