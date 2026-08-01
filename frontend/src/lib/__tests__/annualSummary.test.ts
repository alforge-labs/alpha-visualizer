import { describe, it, expect } from 'vitest'
import { buildAnnualSummary } from '../annualSummary'

/**
 * issue #383: 年次リターンバーだけでは正確な値の年次比較・ワースト年の
 * 特定がしにくい。年別サマリ行（リターン・ベンチ超過・MaxDD・取引数・勝率）
 * を組み立てる純関数を固定する。
 */
describe('buildAnnualSummary (issue #383)', () => {
  it('年昇順に、ベンチ超過・取引数・勝率を組み立てる', () => {
    const rows = buildAnnualSummary({
      annualReturns: { '2024': 12.5, '2023': -3.2 },
      benchmarkReturns: { '2023': 5.0, '2024': 10.0 },
      annualMaxDrawdown: { '2023': -18.4 },
      trades: [
        { exit_date: '2023-05-01', return_pct: 2 },
        { exit_date: '2023-09-01', return_pct: -1 },
        { exit_date: '2024-01-15', return_pct: 3 },
      ],
    })
    expect(rows.map((r) => r.year)).toEqual(['2023', '2024'])
    const y2023 = rows[0]!
    expect(y2023.returnPct).toBe(-3.2)
    expect(y2023.benchReturnPct).toBe(5.0)
    expect(y2023.excessPct).toBeCloseTo(-8.2, 5)
    expect(y2023.maxDdPct).toBe(-18.4)
    expect(y2023.tradeCount).toBe(2)
    expect(y2023.winRatePct).toBeCloseTo(50, 5)
    const y2024 = rows[1]!
    expect(y2024.maxDdPct).toBeNull()
    expect(y2024.tradeCount).toBe(1)
  })

  it('ベンチが無い年は excess も null', () => {
    const rows = buildAnnualSummary({
      annualReturns: { '2024': 8 },
      benchmarkReturns: {},
      trades: [],
    })
    expect(rows[0]!.benchReturnPct).toBeNull()
    expect(rows[0]!.excessPct).toBeNull()
    expect(rows[0]!.winRatePct).toBeNull()
  })
})
