import { describe, it, expect } from 'vitest'
import {
  toDrawdown, currentDrawdown, peakIndex, dayChangePct,
  totalReturnPct, excessReturnPt, daysBetween,
} from '../liveEquity'

describe('toDrawdown', () => {
  it('ピークからの下方乖離を負値で返す', () => {
    expect(toDrawdown([100, 120, 90, 120])).toEqual([0, 0, -0.25, 0])
  })
  it('空配列は空配列', () => {
    expect(toDrawdown([])).toEqual([])
  })
  it('全同値なら全て 0（ゼロ除算しない）', () => {
    expect(toDrawdown([100, 100, 100])).toEqual([0, 0, 0])
  })
})

describe('currentDrawdown', () => {
  it('末尾時点のドローダウンを返す', () => {
    expect(currentDrawdown([100, 120, 90])).toBeCloseTo(-0.25)
  })
  it('1 点なら 0', () => {
    expect(currentDrawdown([100])).toBe(0)
  })
})

describe('peakIndex', () => {
  it('最大値のインデックスを返す（同値なら最初）', () => {
    expect(peakIndex([100, 120, 120, 90])).toBe(1)
  })
})

describe('dayChangePct', () => {
  it('直近 2 点の変化率', () => {
    expect(dayChangePct([100, 110])).toBeCloseTo(0.1)
  })
  it('2 点未満は null', () => {
    expect(dayChangePct([100])).toBeNull()
  })
})

describe('totalReturnPct', () => {
  it('先頭から末尾までの変化率', () => {
    expect(totalReturnPct([100, 110])).toBeCloseTo(0.1)
  })
  it('先頭が 0 なら 0（ゼロ除算しない）', () => {
    expect(totalReturnPct([0, 110])).toBe(0)
  })
})

describe('excessReturnPt', () => {
  it('Live が上回れば正のパーセントポイント', () => {
    // Live +10%, Bench +4% → +6pt
    expect(excessReturnPt([100, 110], [100, 104])).toBeCloseTo(6)
  })
  it('ベンチマークが空なら null', () => {
    expect(excessReturnPt([100, 110], [])).toBeNull()
  })
})

describe('daysBetween', () => {
  it('暦日数を返す', () => {
    expect(daysBetween('2026-06-04T00:00:00', '2026-07-25T00:00:00')).toBe(51)
  })
})
