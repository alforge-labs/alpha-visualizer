/**
 * useChartTheme() のトークンを lightweight-charts の ChartOptions / SeriesOptions に変換する純粋関数群。
 *
 * data-variation 変更時はチャート再マウントせず `applyOptions` で再適用する想定。
 */
import {
  ColorType,
  LineStyle,
  type AreaSeriesPartialOptions,
  type CandlestickSeriesPartialOptions,
  type ChartOptions,
  type CreatePriceLineOptions,
  type DeepPartial,
  type HistogramSeriesPartialOptions,
  type LineSeriesPartialOptions,
} from 'lightweight-charts'

import type { ChartTheme } from '../../design/useChartTheme'
import type { Lang } from '../../i18n/strings'

/**
 * Trade marker / priceLine の色トークン。
 * `tradesToMarkers` / `tradeToPriceLines` に渡して使う。
 */
export interface TradeMarkerColors {
  longWin: string
  longLoss: string
  shortWin: string
  shortLoss: string
  /** open trade（exit 未確定）の中立色 */
  neutral: string
}

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

export function chartThemeToOptions(theme: ChartTheme, lang: Lang): DeepPartial<ChartOptions> {
  return {
    // issue #315: 未指定だと navigator.language に従い、アプリの言語切替に
    // 時間軸の目盛（「2021年」「6月」等）が追従しない。
    localization: {
      locale: lang === 'ja' ? 'ja-JP' : 'en-US',
    },
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

/**
 * OHLC ローソク（CandlestickSeries）の up/down 色を equity area と統一する。
 */
export function candlestickOptions(theme: ChartTheme): CandlestickSeriesPartialOptions {
  return {
    upColor: theme.success,
    downColor: theme.danger,
    borderUpColor: theme.success,
    borderDownColor: theme.danger,
    wickUpColor: theme.success,
    wickDownColor: theme.danger,
    priceLineVisible: false,
    lastValueVisible: true,
  }
}

/**
 * Trade marker の 4 色（long/short × win/loss）+ 中立色（open trade）。
 *
 * - long-win / long-loss: equity の up/down と同じ success/danger
 * - short-win / short-loss: long と区別するため accentStrong / warn を割り当て
 * - neutral: 未確定 open trade（exit_price == null）
 */
export function tradeMarkerColors(theme: ChartTheme): TradeMarkerColors {
  return {
    longWin: theme.success,
    longLoss: theme.danger,
    shortWin: theme.accentStrong,
    shortLoss: theme.warn,
    neutral: theme.text3,
  }
}

function basePriceLineOptions(
  color: string,
  title: string,
  price: number,
): CreatePriceLineOptions {
  return {
    price,
    color,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title,
  }
}

export function entryPriceLineOptions(theme: ChartTheme, price: number): CreatePriceLineOptions {
  return basePriceLineOptions(theme.text3, 'entry', price)
}

export function slPriceLineOptions(theme: ChartTheme, price: number): CreatePriceLineOptions {
  return basePriceLineOptions(theme.danger, 'SL', price)
}

export function tpPriceLineOptions(theme: ChartTheme, price: number): CreatePriceLineOptions {
  return basePriceLineOptions(theme.success, 'TP', price)
}
