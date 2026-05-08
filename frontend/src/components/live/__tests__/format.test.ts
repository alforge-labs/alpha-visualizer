import { describe, it, expect } from 'vitest'
import { diffTone, toneColor } from '../format'

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

describe('toneColor', () => {
  it('maps tones to CSS variables', () => {
    expect(toneColor('good')).toBe('var(--success)')
    expect(toneColor('bad')).toBe('var(--danger)')
    expect(toneColor('neutral')).toBe('var(--text3)')
  })
})
