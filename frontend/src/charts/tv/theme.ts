/**
 * useChartTheme() のトークンを lightweight-charts の ChartOptions / SeriesOptions に変換する純粋関数群。
 *
 * data-variation 変更時はチャート再マウントせず `applyOptions` で再適用する想定。
 */
import {
  ColorType,
  LineStyle,
  type AreaSeriesPartialOptions,
  type ChartOptions,
  type DeepPartial,
  type HistogramSeriesPartialOptions,
  type LineSeriesPartialOptions,
} from 'lightweight-charts'

import type { ChartTheme } from '../../design/useChartTheme'

/**
 * `#RRGGBB` 表記の hex を `rgba(r, g, b, a)` 文字列へ変換する。
 * `getComputedStyle` 経由で得られる値は通常 hex で返ってくるため、それを前提に処理する。
 * パースできない値（既に `rgb(...)` / `rgba(...)` 形式や CSS var）の場合は元の文字列をそのまま返す。
 */
export function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.trim()
  const match = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  if (!match) return trimmed
  const captured = match[1]
  if (captured == null) return trimmed
  const value = parseInt(captured, 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function chartThemeToOptions(theme: ChartTheme): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: theme.bg },
      textColor: theme.text2,
      fontFamily: theme.mono,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: theme.border, style: LineStyle.Dotted },
      horzLines: { color: theme.border, style: LineStyle.Dotted },
    },
    crosshair: {
      vertLine: {
        color: theme.borderStrong,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: theme.bg2,
      },
      horzLine: {
        color: theme.borderStrong,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: theme.bg2,
      },
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: false,
      secondsVisible: false,
    },
    rightPriceScale: {
      borderColor: theme.border,
    },
    handleScroll: true,
    handleScale: true,
  }
}

export function equityAreaOptions(theme: ChartTheme, isPositive: boolean): AreaSeriesPartialOptions {
  const lineColor = isPositive ? theme.success : theme.danger
  return {
    lineColor,
    topColor: hexToRgba(lineColor, 0.32),
    bottomColor: hexToRgba(lineColor, 0.02),
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
  }
}

export function benchmarkLineOptions(theme: ChartTheme): LineSeriesPartialOptions {
  return {
    color: theme.text3,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    priceLineVisible: false,
    lastValueVisible: false,
  }
}

export function drawdownHistogramOptions(theme: ChartTheme): HistogramSeriesPartialOptions {
  return {
    color: hexToRgba(theme.danger, 0.65),
    priceFormat: { type: 'percent', precision: 2, minMove: 0.01 },
    priceLineVisible: false,
    lastValueVisible: true,
  }
}
