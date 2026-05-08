import { describe, it, expect } from 'vitest'
import { runMonteCarlo } from '../monteCarlo'

describe('runMonteCarlo', () => {
  it('生成される sample 点と各 band 配列の長さが xs と一致する', () => {
    const trades = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.005))
    const result = runMonteCarlo({ trades, nSimulations: 100 })

    expect(result.xs.length).toBeGreaterThan(0)
    expect(result.bands.p5.length).toBe(result.xs.length)
    expect(result.bands.p25.length).toBe(result.xs.length)
    expect(result.bands.p50.length).toBe(result.xs.length)
    expect(result.bands.p75.length).toBe(result.xs.length)
    expect(result.bands.p95.length).toBe(result.xs.length)
    expect(result.finalEquities.length).toBe(100)
  })

  it('各時点で percentile が p5 <= p25 <= p50 <= p75 <= p95 を満たす', () => {
    const trades = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 0.02 : -0.01))
    const result = runMonteCarlo({ trades, nSimulations: 200 })

    for (let i = 0; i < result.xs.length; i++) {
      expect(result.bands.p5[i]).toBeLessThanOrEqual(result.bands.p25[i]!)
      expect(result.bands.p25[i]).toBeLessThanOrEqual(result.bands.p50[i]!)
      expect(result.bands.p50[i]).toBeLessThanOrEqual(result.bands.p75[i]!)
      expect(result.bands.p75[i]).toBeLessThanOrEqual(result.bands.p95[i]!)
    }

    // finalStats も同様に整合
    expect(result.finalStats.p5).toBeLessThanOrEqual(result.finalStats.p50)
    expect(result.finalStats.p50).toBeLessThanOrEqual(result.finalStats.p95)
  })

  it('空のトレードでは initialEquity をフラットに返す', () => {
    const result = runMonteCarlo({ trades: [], nSimulations: 50, initialEquity: 100 })

    expect(result.bands.p5.every(v => v === 100)).toBe(true)
    expect(result.bands.p50.every(v => v === 100)).toBe(true)
    expect(result.bands.p95.every(v => v === 100)).toBe(true)
    expect(result.finalStats.lossProb).toBe(0)

    const custom = runMonteCarlo({ trades: [], nSimulations: 10, initialEquity: 1 })
    expect(custom.bands.p50.every(v => v === 1)).toBe(true)
  })

  it('同じ seed では決定論的に同じ結果を返す（再現性）', () => {
    const trades = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 0.01)
    const a = runMonteCarlo({ trades, nSimulations: 100, seed: 42 })
    const b = runMonteCarlo({ trades, nSimulations: 100, seed: 42 })

    expect(b.bands.p5).toEqual(a.bands.p5)
    expect(b.bands.p50).toEqual(a.bands.p50)
    expect(b.bands.p95).toEqual(a.bands.p95)
    expect(b.finalEquities).toEqual(a.finalEquities)

    // 異なる seed なら結果も異なる（少なくとも一部）
    const c = runMonteCarlo({ trades, nSimulations: 100, seed: 999 })
    expect(c.finalEquities).not.toEqual(a.finalEquities)
  })

  it('lossProb は最終エクイティが initialEquity を下回った割合（%）を返す', () => {
    // 全トレードがマイナスなので loss probability は 100% 近くになるはず
    const losingTrades = Array.from({ length: 20 }, () => -0.01)
    const losingResult = runMonteCarlo({ trades: losingTrades, nSimulations: 100 })
    expect(losingResult.finalStats.lossProb).toBe(100)

    // 全トレードがプラスなので lossProb は 0
    const winningTrades = Array.from({ length: 20 }, () => 0.01)
    const winningResult = runMonteCarlo({ trades: winningTrades, nSimulations: 100 })
    expect(winningResult.finalStats.lossProb).toBe(0)
  })
})
