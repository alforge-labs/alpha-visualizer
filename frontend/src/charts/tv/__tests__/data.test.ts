import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  dateStringToTime,
  fromViewportPoints,
  makeCutoffMarkers,
  toHistogramData,
  toLineData,
} from '../data'
import type { EquityViewportPoint } from '../../../hooks/useEquityViewport'

describe('dateStringToTime', () => {
  it('YYYY-MM-DD はそのまま BusinessDay 互換文字列として返す', () => {
    expect(dateStringToTime('2024-01-15')).toBe('2024-01-15')
  })

  it('ISO datetime は UTCTimestamp (秒) に変換する', () => {
    const result = dateStringToTime('2024-01-15T00:00:00Z')
    expect(typeof result).toBe('number')
    expect(result).toBe(Math.floor(Date.UTC(2024, 0, 15) / 1000))
  })

  it('空文字や invalid な日付は null を返す', () => {
    expect(dateStringToTime('')).toBeNull()
    expect(dateStringToTime('not-a-date')).toBeNull()
  })
})

describe('toLineData', () => {
  it('日付と値を 1:1 で詰めて LineData[] にする', () => {
    const result = toLineData(['2024-01-01', '2024-01-02'], [100, 101])
    expect(result).toEqual([
      { time: '2024-01-01', value: 100 },
      { time: '2024-01-02', value: 101 },
    ])
  })

  it('NaN / Infinity は除外する', () => {
    const result = toLineData(
      ['2024-01-01', '2024-01-02', '2024-01-03'],
      [100, NaN, 102],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ time: '2024-01-01', value: 100 })
    expect(result[1]).toEqual({ time: '2024-01-03', value: 102 })
  })

  it('property: 有効入力の出力長は入力長以下', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ noNaN: true, noDefaultInfinity: true })),
        (values) => {
          const dates = values.map((_, i) => `2024-01-${String((i % 28) + 1).padStart(2, '0')}`)
          const result = toLineData(dates, values)
          expect(result.length).toBeLessThanOrEqual(values.length)
        },
      ),
    )
  })
})

describe('toHistogramData', () => {
  it('drawdown 配列を HistogramData にする', () => {
    const result = toHistogramData(['2024-01-01', '2024-01-02'], [0, -5.2])
    expect(result).toEqual([
      { time: '2024-01-01', value: 0 },
      { time: '2024-01-02', value: -5.2 },
    ])
  })
})

describe('fromViewportPoints', () => {
  const makePoint = (i: number, date: string, value: number, benchmark: number | null): EquityViewportPoint => ({
    date: new Date(date),
    value,
    benchmark,
    origIdx: i,
  })

  it('equity / benchmark / origIndices を並列に返す', () => {
    const points: EquityViewportPoint[] = [
      makePoint(10, '2024-01-01', 100, 100),
      makePoint(11, '2024-01-02', 101, 101.5),
      makePoint(12, '2024-01-03', 102, null),
    ]
    const result = fromViewportPoints(points)
    expect(result.equity).toHaveLength(3)
    expect(result.benchmark).toHaveLength(2)
    expect(result.origIndices).toEqual([10, 11, 12])
    expect(result.equity[0]).toEqual({ time: '2024-01-01', value: 100 })
    expect(result.benchmark[0]).toEqual({ time: '2024-01-01', value: 100 })
  })
})

describe('makeCutoffMarkers', () => {
  it('cutoffIdx が viewport 内にあるとき 1 件のマーカーを返す', () => {
    const origIndices = [10, 11, 12, 13, 14]
    const times = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']
    const result = makeCutoffMarkers(origIndices, 12, times, '#ffffff')
    expect(result).toHaveLength(1)
    const marker = result[0]
    expect(marker).toBeDefined()
    expect(marker?.time).toBe('2024-01-03')
    expect(marker?.position).toBe('aboveBar')
  })

  it('cutoffIdx <= 0 の時は空配列を返す', () => {
    const result = makeCutoffMarkers([0, 1, 2], 0, ['2024-01-01', '2024-01-02', '2024-01-03'], '#000')
    expect(result).toEqual([])
  })

  it('cutoffIdx が viewport より後ろなら空配列を返す', () => {
    const result = makeCutoffMarkers([0, 1, 2], 999, ['2024-01-01', '2024-01-02', '2024-01-03'], '#000')
    expect(result).toEqual([])
  })

  it('cutoffIdx が viewport の最後の点ちょうどなら空配列を返す (ラベル表示が潰れるため)', () => {
    const origIndices = [0, 1, 2]
    const times = ['2024-01-01', '2024-01-02', '2024-01-03']
    const result = makeCutoffMarkers(origIndices, 2, times, '#000')
    expect(result).toEqual([])
  })
})
