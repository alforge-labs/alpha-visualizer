import { describe, it, expect } from 'vitest'
import { evaluateGood, type GoodWhen } from '../evaluate'

describe('evaluateGood — early returns', () => {
  it('returns null when goodWhen is null', () => {
    expect(evaluateGood(1, null)).toBeNull()
    expect(evaluateGood(-1, null)).toBeNull()
    expect(evaluateGood(0, null)).toBeNull()
  })

  it('returns null when num is null even with a non-null goodWhen', () => {
    const policies: GoodWhen[] = ['pos', 'neg', 'gte1', 'gte15', 'wr']
    for (const p of policies) {
      expect(evaluateGood(null, p)).toBeNull()
    }
  })
})

describe.each<{ policy: Exclude<GoodWhen, null>; cases: ReadonlyArray<readonly [number, boolean]> }>([
  {
    policy: 'pos',
    cases: [
      [1, true],
      [0.0001, true],
      [0, false],
      [-0.0001, false],
      [-100, false],
    ],
  },
  {
    policy: 'neg',
    cases: [
      [-1, true],
      [-0.0001, true],
      [0, false],
      [0.0001, false],
      [100, false],
    ],
  },
  {
    policy: 'gte1',
    cases: [
      [1.0, true],
      [1.5, true],
      [0.99, false],
      [0, false],
      [-1, false],
    ],
  },
  {
    policy: 'gte15',
    cases: [
      [1.5, true],
      [2.0, true],
      [1.49, false],
      [1.0, false],
      [0, false],
    ],
  },
  {
    policy: 'wr',
    cases: [
      [50, true],
      [99.9, true],
      [49.99, false],
      [0, false],
    ],
  },
])('evaluateGood — policy "$policy"', ({ policy, cases }) => {
  it.each(cases)('num=%s → %s', (num, expected) => {
    expect(evaluateGood(num, policy)).toBe(expected)
  })
})
