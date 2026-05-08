import { describe, it, expect } from 'vitest'
import { L, makeL, makeT, STRINGS, t } from '../strings'

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

describe('t (STRINGS map ベース)', () => {
  it('returns the ja string when lang is "ja"', () => {
    expect(t('ja', 'common.loading')).toBe('読み込み中…')
    expect(t('ja', 'common.cancel')).toBe('キャンセル')
  })

  it('returns the en string when lang is "en"', () => {
    expect(t('en', 'common.loading')).toBe('Loading…')
    expect(t('en', 'common.cancel')).toBe('Cancel')
  })

  it('解決できる detail スコープのキーを引ける', () => {
    expect(t('en', 'detail.noWfo')).toBe(
      'No walk-forward (WFO) data for this strategy',
    )
  })
})

describe('makeT', () => {
  it('lang を束縛したヘルパを返す', () => {
    const T = makeT('en')
    expect(T('common.cancel')).toBe('Cancel')
    expect(T('detail.noBacktest')).toBe('No backtest result found')
  })
})

describe('STRINGS map の整合性', () => {
  it('各 key で ja / en の両方が定義されている', () => {
    for (const key of Object.keys(STRINGS) as Array<keyof typeof STRINGS>) {
      expect(typeof STRINGS[key].ja).toBe('string')
      expect(typeof STRINGS[key].en).toBe('string')
      expect(STRINGS[key].ja.length).toBeGreaterThan(0)
      expect(STRINGS[key].en.length).toBeGreaterThan(0)
    }
  })

  it('key の命名規約 <scope>.<term> に従っている', () => {
    for (const key of Object.keys(STRINGS) as string[]) {
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/)
    }
  })
})
