import { describe, it, expect } from 'vitest'
import { diffTone, formatDiff, formatNumber, formatInteger, toneColor } from '../format'

describe('diffTone', () => {
  it('returns neutral for null/undefined/zero/non-finite', () => {
    expect(diffTone(null)).toBe('neutral')
    expect(diffTone(undefined)).toBe('neutral')
    expect(diffTone(0)).toBe('neutral')
    expect(diffTone(Number.NaN)).toBe('neutral')
    expect(diffTone(Number.POSITIVE_INFINITY)).toBe('neutral')
  })

  it('returns good for positive values', () => {
    expect(diffTone(0.1)).toBe('good')
    expect(diffTone(50)).toBe('good')
  })

  it('returns bad for negative values', () => {
    expect(diffTone(-0.001)).toBe('bad')
    expect(diffTone(-100)).toBe('bad')
  })
})

describe('formatDiff', () => {
  it('renders dash for null/undefined', () => {
    expect(formatDiff(null)).toBe('—')
    expect(formatDiff(undefined)).toBe('—')
  })

  it('keeps positive sign with + prefix', () => {
    expect(formatDiff(1.234, '%')).toBe('+1.234%')
    expect(formatDiff(15)).toBe('+15.00')
    expect(formatDiff(150)).toBe('+150.0')
  })

  it('renders negative values with leading minus', () => {
    expect(formatDiff(-1.234, '%')).toBe('-1.234%')
  })

  it('renders zero without leading sign', () => {
    expect(formatDiff(0)).toBe('0.000')
  })
})

describe('formatNumber / formatInteger', () => {
  it('formatNumber renders dash for null/undefined/non-finite', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(Number.NaN)).toBe('—')
  })

  it('formatNumber adapts decimal places by magnitude', () => {
    expect(formatNumber(0.123, '%')).toBe('0.123%')
    expect(formatNumber(12.34)).toBe('12.34')
    expect(formatNumber(123.4)).toBe('123.4')
  })

  it('formatInteger rounds to nearest integer', () => {
    expect(formatInteger(null)).toBe('—')
    expect(formatInteger(3.4)).toBe('3')
    expect(formatInteger(3.6)).toBe('4')
  })
})

describe('toneColor', () => {
  it('maps tones to CSS variables', () => {
    expect(toneColor('good')).toBe('var(--success)')
    expect(toneColor('bad')).toBe('var(--danger)')
    expect(toneColor('neutral')).toBe('var(--text3)')
  })
})
