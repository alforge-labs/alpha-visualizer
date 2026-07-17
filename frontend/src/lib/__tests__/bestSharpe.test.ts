import { describe, expect, it } from 'vitest'
import { selectBestSharpe } from '../bestSharpe'

/**
 * Winner 選定規約の SSoT: CompareScreen の Winner バナーと
 * 共有ツイート文言の両方がこの関数を参照する。
 */
describe('selectBestSharpe', () => {
  it('picks the highest sharpe', () => {
    const items = [
      { name: 'a', sharpe_ratio: 0.8 },
      { name: 'b', sharpe_ratio: 1.9 },
      { name: 'c', sharpe_ratio: 1.2 },
    ]
    expect(selectBestSharpe(items)?.name).toBe('b')
  })

  it('falls back to the first item when all sharpe are null (tie は先着優先)', () => {
    const items = [
      { name: 'a', sharpe_ratio: null },
      { name: 'b', sharpe_ratio: null },
    ]
    expect(selectBestSharpe(items)?.name).toBe('a')
  })

  it('returns undefined for an empty array', () => {
    expect(selectBestSharpe([])).toBeUndefined()
  })
})
