import { describe, it, expect } from 'vitest'
import { L, makeL } from '../strings'

describe('L', () => {
  it('returns the ja string when lang is "ja"', () => {
    expect(L('ja', 'こんにちは', 'Hello')).toBe('こんにちは')
  })

  it('returns the en string when lang is "en"', () => {
    expect(L('en', 'こんにちは', 'Hello')).toBe('Hello')
  })
})

describe('makeL', () => {
  it('binds the lang to a curried L function (ja)', () => {
    const t = makeL('ja')
    expect(t('シャープ比', 'Sharpe Ratio')).toBe('シャープ比')
    expect(t('リターン', 'Return')).toBe('リターン')
  })

  it('binds the lang to a curried L function (en)', () => {
    const t = makeL('en')
    expect(t('シャープ比', 'Sharpe Ratio')).toBe('Sharpe Ratio')
    expect(t('リターン', 'Return')).toBe('Return')
  })
})
