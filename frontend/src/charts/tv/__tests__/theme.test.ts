import { describe, expect, it } from 'vitest'

import type { ChartTheme } from '../../../design/useChartTheme'
import {
  benchmarkLineOptions,
  chartThemeToOptions,
  drawdownHistogramOptions,
  equityAreaOptions,
  hexToRgba,
} from '../theme'

const sampleTheme: ChartTheme = {
  text: '#222222',
  text2: '#444444',
  text3: '#666666',
  border: '#dddddd',
  borderStrong: '#bbbbbb',
  surface: '#fafafa',
  surface2: '#f3f3f3',
  bg: '#ffffff',
  bg2: '#eeeeee',
  accent: '#c25a2a',
  accentStrong: '#a04a20',
  accentGlow: 'rgba(194, 90, 42, 0.3)',
  accentBg: 'rgba(194, 90, 42, 0.1)',
  success: '#4f7a3f',
  warn: '#c79b2a',
  danger: '#b03030',
  serif: 'Source Serif 4',
  sans: 'Inter Tight',
  mono: 'JetBrains Mono',
  series: ['#c25a2a', '#5b7a8c', '#4f7a3f', '#8b5e3c', '#7b5380'],
}

describe('hexToRgba', () => {
  it('6 桁 hex を rgba 文字列に変換する', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)')
  })

  it('既に rgba 形式や CSS var の値はそのまま返す', () => {
    expect(hexToRgba('rgba(1, 2, 3, 0.4)', 0.5)).toBe('rgba(1, 2, 3, 0.4)')
    expect(hexToRgba('var(--accent)', 0.5)).toBe('var(--accent)')
  })

  it('alpha は 0..1 にクランプする', () => {
    expect(hexToRgba('#000000', 2)).toBe('rgba(0, 0, 0, 1)')
    expect(hexToRgba('#000000', -1)).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('chartThemeToOptions', () => {
  it('テーマの主要トークンを ChartOptions にマップする', () => {
    const opts = chartThemeToOptions(sampleTheme)
    expect(opts.layout?.background).toMatchObject({ color: '#ffffff' })
    expect(opts.layout?.textColor).toBe('#444444')
    expect(opts.layout?.fontFamily).toBe('JetBrains Mono')
    expect(opts.grid?.vertLines?.color).toBe('#dddddd')
    expect(opts.crosshair?.vertLine?.color).toBe('#bbbbbb')
    expect(opts.timeScale?.borderColor).toBe('#dddddd')
    expect(opts.rightPriceScale?.borderColor).toBe('#dddddd')
  })
})

describe('equityAreaOptions', () => {
  it('isPositive=true のとき success 色になる', () => {
    const opts = equityAreaOptions(sampleTheme, true)
    expect(opts.lineColor).toBe('#4f7a3f')
    expect(opts.topColor).toBe('rgba(79, 122, 63, 0.32)')
    expect(opts.bottomColor).toBe('rgba(79, 122, 63, 0.02)')
  })

  it('isPositive=false のとき danger 色になる', () => {
    const opts = equityAreaOptions(sampleTheme, false)
    expect(opts.lineColor).toBe('#b03030')
  })
})

describe('drawdownHistogramOptions', () => {
  it('danger 色 + percent フォーマットを返す', () => {
    const opts = drawdownHistogramOptions(sampleTheme)
    expect(opts.color).toMatch(/^rgba\(176, 48, 48, 0\.65\)$/)
    expect(opts.priceFormat).toEqual({ type: 'percent', precision: 2, minMove: 0.01 })
  })
})

describe('benchmarkLineOptions', () => {
  it('text3 + dashed を返す', () => {
    const opts = benchmarkLineOptions(sampleTheme)
    expect(opts.color).toBe('#666666')
    expect(opts.lineWidth).toBe(1)
    expect(opts.lineStyle).toBeDefined()
  })
})
