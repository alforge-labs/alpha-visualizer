import { describe, it, expect } from 'vitest'
import { sliceByRange } from '../useEquityViewport'

describe('sliceByRange', () => {
  it('range="ALL" は全データを返し startIdx は 0', () => {
    const equity = [100, 101, 102]
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03']
    const result = sliceByRange({ equity, dates }, 'ALL')

    expect(result.startIdx).toBe(0)
    expect(result.points).toHaveLength(3)
    expect(result.points[0]?.value).toBe(100)
    expect(result.points[2]?.value).toBe(102)
  })

  it('短期 range は末尾 N 本（または全長）に切り詰められる', () => {
    // RANGE_N["1M"] = 21（営業日換算）想定。データが少なければ全部返す
    const equity = Array.from({ length: 5 }, (_, i) => 100 + i)
    const dates = Array.from({ length: 5 }, (_, i) => `2024-01-0${i + 1}`)
    const result = sliceByRange({ equity, dates }, '1M')

    expect(result.points.length).toBeLessThanOrEqual(equity.length)
    // 末尾が一致
    expect(result.points[result.points.length - 1]?.value).toBe(104)
  })

  it('benchmark が渡されると points 各要素に対応値が乗る', () => {
    const equity = [100, 110]
    const dates = ['2024-01-01', '2024-01-02']
    const benchmark = [99, 105]
    const result = sliceByRange({ equity, dates, benchmark }, 'ALL')

    expect(result.points[0]?.benchmark).toBe(99)
    expect(result.points[1]?.benchmark).toBe(105)
  })

  it('benchmark 省略時は points.benchmark が null', () => {
    const equity = [100, 110]
    const dates = ['2024-01-01', '2024-01-02']
    const result = sliceByRange({ equity, dates }, 'ALL')

    expect(result.points[0]?.benchmark).toBeNull()
    expect(result.points[1]?.benchmark).toBeNull()
  })

  it('origIdx は元の equity 配列でのインデックスを保持する', () => {
    // 末尾 2 本だけが切り出されるケース（仮想的に手で startIdx を確認）
    const equity = Array.from({ length: 600 }, (_, i) => 100 + i)
    const dates = Array.from({ length: 600 }, () => '2024-01-01')
    const result = sliceByRange({ equity, dates }, '1M')

    if (result.points.length > 0) {
      const first = result.points[0]!
      const last = result.points[result.points.length - 1]!
      expect(first.origIdx).toBe(result.startIdx)
      expect(last.origIdx).toBe(result.startIdx + result.points.length - 1)
    }
  })
})
