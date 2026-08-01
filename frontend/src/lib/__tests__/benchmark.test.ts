import { describe, it, expect } from 'vitest'
import { compareWithBenchmark } from '../benchmark'

/**
 * issue #370: ベンチマークが同一銘柄 B&H 固定だった。任意銘柄の OHLC から
 * 正規化オーバーレイ系列と対ベンチ指標（β/α/IR/超過）を計算する純関数を固定する。
 */
describe('compareWithBenchmark (issue #370)', () => {
  const dates = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06']

  it('ベンチと同一リターンなら β=1・α≈0・超過≈0', () => {
    const equity = [100, 110, 99, 108.9]
    const bars = [
      { time: '2025-01-01', close: 50 },
      { time: '2025-01-02', close: 55 },
      { time: '2025-01-03', close: 49.5 },
      { time: '2025-01-06', close: 54.45 },
    ]
    const r = compareWithBenchmark({ equityDates: dates, equityValues: equity, benchBars: bars })!
    expect(r.beta).toBeCloseTo(1, 6)
    expect(r.alphaPct).toBeCloseTo(0, 6)
    expect(r.excessReturnPct).toBeCloseTo(0, 6)
    // オーバーレイは戦略の開始値に正規化される
    expect(r.benchmarkEquity[0]).toBeCloseTo(100, 6)
    expect(r.benchmarkEquity[3]).toBeCloseTo(108.9, 6)
    expect(r.alignedDays).toBe(3)
  })

  it('ベンチの欠損日は直前値で埋める（前方フィル）', () => {
    const equity = [100, 101, 102, 103]
    const bars = [
      { time: '2025-01-01', close: 10 },
      // 01-02 欠損
      { time: '2025-01-03', close: 12 },
      { time: '2025-01-06', close: 12 },
    ]
    const r = compareWithBenchmark({ equityDates: dates, equityValues: equity, benchBars: bars })!
    expect(r.benchmarkEquity).toHaveLength(4)
    // 01-02 は 01-01 の値のまま
    expect(r.benchmarkEquity[1]).toBeCloseTo(r.benchmarkEquity[0]!, 6)
  })

  it('重なりが 2 日未満なら null', () => {
    const r = compareWithBenchmark({
      equityDates: dates,
      equityValues: [100, 101, 102, 103],
      benchBars: [{ time: '2030-01-01', close: 10 }],
    })
    expect(r).toBeNull()
  })
})
