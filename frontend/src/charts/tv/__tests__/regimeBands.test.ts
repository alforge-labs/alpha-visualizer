import { describe, expect, it, vi } from 'vitest'

import type { RegimeSeries } from '../../../api/types'
import {
  buildRegimeBands,
  regimeBandColor,
  regimeBandFill,
  regimeLabel,
  createRegimeBandsPrimitive,
} from '../regimeBands'

/**
 * issue #317: #187 の visx 撤去でエクイティチャートのレジーム背景表示が失われた。
 * lightweight-charts の series primitive で背景バンドを復元する。
 */

const PALETTE = ['#c25a2a', '#5b7a8c', '#4f7a3f', '#8b5e3c', '#7b5380'] as const

describe('buildRegimeBands', () => {
  it('隣接する同一 state を 1 本のバンドに集約する', () => {
    const series: RegimeSeries = {
      dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06'],
      states: [0, 0, 1, 1, 1, 0],
      n_states: 2,
    }
    expect(buildRegimeBands(series)).toEqual([
      { state: 0, from: '2024-01-01', to: '2024-01-02' },
      { state: 1, from: '2024-01-03', to: '2024-01-05' },
      { state: 0, from: '2024-01-06', to: '2024-01-06' },
    ])
  })

  it('末尾のバンドは最終日で閉じる（描画が途切れないこと）', () => {
    const series: RegimeSeries = {
      dates: ['2024-01-01', '2024-01-02'],
      states: [1, 1],
      n_states: 2,
    }
    expect(buildRegimeBands(series)).toEqual([{ state: 1, from: '2024-01-01', to: '2024-01-02' }])
  })

  it('dates と states の長さがズレていても短い方に合わせて破綻しない', () => {
    const series: RegimeSeries = {
      dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
      states: [0, 1],
      n_states: 2,
    }
    expect(buildRegimeBands(series)).toEqual([
      { state: 0, from: '2024-01-01', to: '2024-01-01' },
      { state: 1, from: '2024-01-02', to: '2024-01-02' },
    ])
  })

  it('空・不正な入力では空配列を返す', () => {
    expect(buildRegimeBands(null)).toEqual([])
    expect(buildRegimeBands(undefined)).toEqual([])
    expect(buildRegimeBands({ dates: [], states: [], n_states: 0 })).toEqual([])
  })
})

describe('regimeBandColor', () => {
  it('palette 内の state は palette の色を使う', () => {
    expect(regimeBandColor(0, 2, PALETTE)).toBe('#c25a2a')
    expect(regimeBandColor(1, 2, PALETTE)).toBe('#5b7a8c')
  })

  it('palette を超える state でも state ごとに異なる色を返す', () => {
    const a = regimeBandColor(7, 9, PALETTE)
    const b = regimeBandColor(8, 9, PALETTE)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^hsl\(/)
  })
})

describe('regimeBandFill', () => {
  it('palette 内の色は指定 alpha の rgba になる', () => {
    expect(regimeBandFill(0, 2, PALETTE, 0.14)).toBe('rgba(194, 90, 42, 0.14)')
  })

  // palette を超える state は hsl フォールバックになるが、hexToRgba は hex 以外を
  // 素通しするため、alpha を別途載せないと不透明な帯がチャートを覆ってしまう。
  it('palette を超える state でも必ず半透明になる', () => {
    const fill = regimeBandFill(7, 9, PALETTE, 0.14)
    expect(fill).toMatch(/^hsla?\(/)
    expect(fill).toContain('0.14')
  })
})

describe('regimeLabel', () => {
  it('label_names があればそれを使い、無ければ S<state> にフォールバックする', () => {
    expect(regimeLabel(1, { '1': 'Bull' })).toBe('Bull')
    expect(regimeLabel(2, { '1': 'Bull' })).toBe('S2')
    expect(regimeLabel(0, undefined)).toBe('S0')
  })
})

/** timeToCoordinate をスタブした最小の chart/series パラメータを作る */
function attachParams(coordFor: (time: unknown) => number | null) {
  return {
    chart: { timeScale: () => ({ timeToCoordinate: coordFor }) },
    series: {},
    requestUpdate: vi.fn(),
    horzScaleBehavior: {},
  } as never
}

/** drawBackground で使われる描画コンテキストを記録するスタブ */
function makeTarget() {
  const calls: Array<{ fillStyle: string; rect: [number, number, number, number] }> = []
  const context = {
    beginPath: () => {},
    fillStyle: '',
    rect(x: number, y: number, w: number, h: number) {
      calls.push({ fillStyle: this.fillStyle as string, rect: [x, y, w, h] })
    },
    fill: () => {},
  }
  const target = {
    useMediaCoordinateSpace: (fn: (scope: unknown) => void) =>
      fn({ context, mediaSize: { width: 500, height: 300 } }),
  }
  return { target, calls }
}

describe('createRegimeBandsPrimitive', () => {
  const series: RegimeSeries = {
    dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
    states: [0, 0, 1, 1],
    n_states: 2,
    label_names: { '0': 'Range', '1': 'Trend' },
  }

  it('背景レイヤー（zOrder=bottom）に描画する', () => {
    const p = createRegimeBandsPrimitive(series, PALETTE, 0.14)
    const view = p.paneViews()[0]
    expect(view?.zOrder?.()).toBe('bottom')
  })

  it('バンドごとに 1 つの矩形を、state ごとに異なる色で塗る', () => {
    const p = createRegimeBandsPrimitive(series, PALETTE, 0.14)
    // 2024-01-01 → x=0 のように日付順に 100px 刻みで座標を返す
    const xs: Record<string, number> = {
      '2024-01-01': 0,
      '2024-01-02': 100,
      '2024-01-03': 200,
      '2024-01-04': 300,
    }
    p.attached(attachParams((t) => xs[t as string] ?? null))

    const { target, calls } = makeTarget()
    p.paneViews()[0]?.renderer()?.drawBackground?.(target as never)

    expect(calls).toHaveLength(2)
    // 高さはペイン全体を覆う
    expect(calls[0]?.rect[1]).toBe(0)
    expect(calls[0]?.rect[3]).toBe(300)
    // state 0 と state 1 で色が異なる
    expect(calls[0]?.fillStyle).not.toBe(calls[1]?.fillStyle)
  })

  it('座標に変換できないバンド（表示範囲外）はスキップする', () => {
    const p = createRegimeBandsPrimitive(series, PALETTE, 0.14)
    p.attached(attachParams(() => null))

    const { target, calls } = makeTarget()
    p.paneViews()[0]?.renderer()?.drawBackground?.(target as never)

    expect(calls).toHaveLength(0)
  })

  it('attach 前でも描画呼び出しで例外を投げない', () => {
    const p = createRegimeBandsPrimitive(series, PALETTE, 0.14)
    const { target, calls } = makeTarget()
    expect(() => p.paneViews()[0]?.renderer()?.drawBackground?.(target as never)).not.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('凡例は state 昇順で重複なく返す', () => {
    const p = createRegimeBandsPrimitive(series, PALETTE, 0.14)
    expect(p.legend()).toEqual([
      { state: 0, label: 'Range', color: '#c25a2a' },
      { state: 1, label: 'Trend', color: '#5b7a8c' },
    ])
  })
})
