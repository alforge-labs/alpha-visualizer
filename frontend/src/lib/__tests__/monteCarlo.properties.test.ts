/**
 * runMonteCarlo の property-based testing。
 *
 * 個別ケース（monteCarlo.test.ts）では捉えきれない不変条件 (invariants) を
 * fast-check で網羅的に検証する。
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { runMonteCarlo } from '../monteCarlo'

const tradeReturn = fc.double({
  min: -0.5,
  max: 0.5,
  noNaN: true,
  noDefaultInfinity: true,
})

const tradesArb = fc.array(tradeReturn, { minLength: 1, maxLength: 30 })

const optionsArb = fc.record({
  trades: tradesArb,
  nSimulations: fc.integer({ min: 1, max: 100 }),
  initialEquity: fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
  seed: fc.integer({ min: 1, max: 2 ** 30 }),
})

describe('runMonteCarlo properties', () => {
  it('finalEquities.length === nSimulations', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const result = runMonteCarlo(opts)
        return result.finalEquities.length === opts.nSimulations
      }),
      { numRuns: 50 },
    )
  })

  it('percentiles satisfy p5 <= p25 <= p50 <= p75 <= p95 at every x', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const { bands, xs } = runMonteCarlo(opts)
        for (let i = 0; i < xs.length; i++) {
          const p5 = bands.p5[i] ?? 0
          const p25 = bands.p25[i] ?? 0
          const p50 = bands.p50[i] ?? 0
          const p75 = bands.p75[i] ?? 0
          const p95 = bands.p95[i] ?? 0
          if (!(p5 <= p25 && p25 <= p50 && p50 <= p75 && p75 <= p95)) {
            return false
          }
        }
        return true
      }),
      { numRuns: 50 },
    )
  })

  it('xs is monotonically increasing and starts at 0', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const { xs } = runMonteCarlo(opts)
        if (xs.length === 0) return true
        if (xs[0] !== 0) return false
        for (let i = 1; i < xs.length; i++) {
          if ((xs[i] ?? 0) < (xs[i - 1] ?? 0)) return false
        }
        return true
      }),
      { numRuns: 50 },
    )
  })

  it('bands arrays are all the same length as xs', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const { xs, bands } = runMonteCarlo(opts)
        const n = xs.length
        return (
          bands.p5.length === n &&
          bands.p25.length === n &&
          bands.p50.length === n &&
          bands.p75.length === n &&
          bands.p95.length === n
        )
      }),
      { numRuns: 50 },
    )
  })

  it('finalEquities is sorted ascending', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const { finalEquities } = runMonteCarlo(opts)
        for (let i = 1; i < finalEquities.length; i++) {
          if ((finalEquities[i] ?? 0) < (finalEquities[i - 1] ?? 0)) return false
        }
        return true
      }),
      { numRuns: 50 },
    )
  })

  it('finalStats.lossProb is always within [0, 100]', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const { finalStats } = runMonteCarlo(opts)
        return finalStats.lossProb >= 0 && finalStats.lossProb <= 100
      }),
      { numRuns: 50 },
    )
  })

  it('same seed → identical results (determinism)', () => {
    fc.assert(
      fc.property(optionsArb, (opts) => {
        const r1 = runMonteCarlo(opts)
        const r2 = runMonteCarlo(opts)
        // 浮動小数点同値性を expect で比較
        expect(r1.finalEquities).toEqual(r2.finalEquities)
        return true
      }),
      { numRuns: 30 },
    )
  })
})
