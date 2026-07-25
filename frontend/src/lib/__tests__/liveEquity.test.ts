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
  it('ピークが負のままなら全て 0（符号反転による偽の正ドローダウンを防ぐ）', () => {
    // WHY: peak <= 0 の間に v / peak - 1 を計算すると符号が反転し、
    // -5 → -20 という実際の下落が +300% という偽の「正のドローダウン」になる。
    // それを避けるため 0 を返す（口座価値が非正なのは想定外の状態でもある）。
    expect(toDrawdown([-10, -5, -20])).toEqual([0, 0, 0])
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
  it('空配列は 0 を返す（呼び出し側が長さをガードする契約）', () => {
    // WHY: 空配列に対して意味のあるインデックスは存在しないが、
    // 現状の実装は 0 を返す。契約を可視化するために固定する。
    expect(peakIndex([])).toBe(0)
  })
})

describe('dayChangePct', () => {
  it('直近 2 点の変化率', () => {
    expect(dayChangePct([100, 110])).toBeCloseTo(0.1)
  })
  it('2 点未満は null', () => {
    expect(dayChangePct([100])).toBeNull()
  })
  it('直前の値が 0 なら null（Infinity/NaN を UI に流さない）', () => {
    // WHY: 0 除算は Infinity になり、そのまま画面に表示されると
    // 意味不明な数値になってしまう。null にして UI 側で「—」等の表示に倒す。
    expect(dayChangePct([0, 110])).toBeNull()
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
  it('Live 側が 2 点未満でも null', () => {
    // WHY: 上の「ベンチマークが空なら null」テストは bench 側のガードしか
    // 検証していない。live 側の `live.length < 2` チェックが誤って
    // 落とされる回帰（例: `if (bench.length < 2) return null` のみ）を
    // 検知できるよう、live 側を短くしたケースを別途固定する。
    expect(excessReturnPt([100], [100, 104])).toBeNull()
  })
})

describe('daysBetween', () => {
  it('暦日数を返す', () => {
    expect(daysBetween('2026-06-04T00:00:00', '2026-07-25T00:00:00')).toBe(51)
  })
})
