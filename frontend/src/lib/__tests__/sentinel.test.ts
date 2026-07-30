import { describe, it, expect } from 'vitest'
import { isNoTradeSentinel } from '../sentinel'

/**
 * issue #351: forge は取引 0 件の run の sharpe_ratio / sortino_ratio に
 * センチネル値 -100 を書き込む。UI はこれを実測値として表示してはならない。
 */
describe('isNoTradeSentinel', () => {
  it('detects the -100 sentinel', () => {
    expect(isNoTradeSentinel(-100)).toBe(true)
    expect(isNoTradeSentinel(-100.0)).toBe(true)
    // 万一 -100 を下回る値が来てもセンチネル扱いにする
    expect(isNoTradeSentinel(-123.4)).toBe(true)
  })

  it('keeps real (possibly bad) values', () => {
    expect(isNoTradeSentinel(-99.9)).toBe(false)
    expect(isNoTradeSentinel(-3.2)).toBe(false)
    expect(isNoTradeSentinel(0)).toBe(false)
    expect(isNoTradeSentinel(1.8)).toBe(false)
  })

  it('treats null / undefined as non-sentinel', () => {
    expect(isNoTradeSentinel(null)).toBe(false)
    expect(isNoTradeSentinel(undefined)).toBe(false)
  })
})
