/**
 * `Trade[]` を lightweight-charts の `SeriesMarker<Time>[]` および
 * `createPriceLine` 用の spec に変換する純粋関数群。
 *
 * - long entry: belowBar arrowUp、long exit: aboveBar arrowDown
 * - short entry: aboveBar arrowDown、short exit: belowBar arrowUp
 * - 色: pnl > 0 で win 色、pnl < 0 で loss 色、open trade (`exit_price == null`) は neutral
 * - text: `+3.2%` / `-1.1%` 短形式（dense markers でも読みやすく）
 * - 出力は時刻昇順にソート（lightweight-charts は unsorted で throw）
 */
import type { SeriesMarker, Time } from 'lightweight-charts'

import type { RegimeSeries, Trade } from '../../api/types'
import { compareTime, dateStringToTime } from './data'
import type { TradeMarkerColors } from './theme'

export type { TradeMarkerColors } from './theme'

export interface TradePriceLineSpec {
  kind: 'entry' | 'sl' | 'tp'
  price: number
  color: string
  title: string
}

function colorFor(trade: Trade, colors: TradeMarkerColors): string {
  const isOpen = trade.exit_price == null
  if (isOpen) return colors.neutral
  const isLong = trade.direction === 'long'
  const isWin = trade.pnl > 0
  if (isLong) return isWin ? colors.longWin : colors.longLoss
  return isWin ? colors.shortWin : colors.shortLoss
}

function shortPct(pct: number): string {
  if (!Number.isFinite(pct)) return ''
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/**
 * Trade 配列を SeriesMarker 配列に変換する。
 * closed trade は entry/exit の 2 marker、open trade は entry のみの 1 marker。
 */
export function tradesToMarkers(
  trades: Trade[],
  colors: TradeMarkerColors,
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = []
  for (const trade of trades) {
    const color = colorFor(trade, colors)
    const isLong = trade.direction === 'long'

    const entryTime = dateStringToTime(trade.entry_date)
    if (entryTime != null) {
      out.push({
        time: entryTime,
        position: isLong ? 'belowBar' : 'aboveBar',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        color,
        text: isLong ? 'L' : 'S',
      })
    }

    const isOpen = trade.exit_price == null
    if (!isOpen && trade.exit_date) {
      const exitTime = dateStringToTime(trade.exit_date)
      if (exitTime != null) {
        out.push({
          time: exitTime,
          position: isLong ? 'aboveBar' : 'belowBar',
          shape: isLong ? 'arrowDown' : 'arrowUp',
          color,
          text: shortPct(trade.return_pct),
        })
      }
    }
  }
  out.sort((a, b) => compareTime(a.time, b.time))
  return out
}

/**
 * SL/TP priceLine の対象となる 1 trade を選ぶ。
 *
 * - open trade（`exit_price == null`）があれば最初の 1 件を返す
 * - 無ければ `entry_date` 最新の closed trade を返す
 * - 空配列なら `null`
 */
export function pickFocusTrade(trades: Trade[]): Trade | null {
  if (trades.length === 0) return null
  const openTrade = trades.find((t) => t.exit_price == null)
  if (openTrade) return openTrade
  let latest: Trade | null = null
  for (const t of trades) {
    if (!t.entry_date) continue
    if (latest == null || t.entry_date > latest.entry_date) latest = t
  }
  // 全 trade に entry_date が無いケースの fallback
  return latest ?? trades[trades.length - 1] ?? null
}

/**
 * Focus trade から entry / sl / tp の priceLine spec を生成する。
 * 値が `null` / `undefined` のキーはスキップ。
 */
export function tradeToPriceLines(
  trade: Trade | null,
  colors: TradeMarkerColors,
): TradePriceLineSpec[] {
  if (trade == null) return []
  const lines: TradePriceLineSpec[] = []
  if (trade.entry_price != null && Number.isFinite(trade.entry_price)) {
    lines.push({ kind: 'entry', price: trade.entry_price, color: colors.neutral, title: 'entry' })
  }
  if (trade.sl_price != null && Number.isFinite(trade.sl_price)) {
    lines.push({
      kind: 'sl',
      price: trade.sl_price,
      color: trade.direction === 'long' ? colors.longLoss : colors.shortLoss,
      title: 'SL',
    })
  }
  if (trade.tp_price != null && Number.isFinite(trade.tp_price)) {
    lines.push({
      kind: 'tp',
      price: trade.tp_price,
      color: trade.direction === 'long' ? colors.longWin : colors.shortWin,
      title: 'TP',
    })
  }
  return lines
}

/**
 * RegimeSeries の状態遷移点（state が変化したバー）に marker を打つ。
 *
 * lightweight-charts は時間軸の背景色塗り分けを標準では提供しないため、
 * regime 切替点を可視化する最小実装として "▽" 形 marker をローソク上方に
 * 配置する。将来 ISeriesPrimitive ベースの背景 overlay に拡張する余地を
 * 残す（marker と overlay は併用可能）。
 *
 * - 最初のバーは「最初の regime 開始」として扱わない（ノイズになるため）
 * - 同じ state が連続する間はスキップ
 * - label_names があれば marker text に short label を入れる
 *
 * @param regimeSeries `BacktestDetail.regime_series`
 * @param color marker 色（theme.text3 等の弱めの色を推奨）
 */
export function regimeChangeMarkers(
  regimeSeries: RegimeSeries | null | undefined,
  color: string,
): SeriesMarker<Time>[] {
  if (!regimeSeries) return []
  const { dates, states, label_names } = regimeSeries
  if (!Array.isArray(dates) || !Array.isArray(states)) return []
  const len = Math.min(dates.length, states.length)
  if (len < 2) return []

  const out: SeriesMarker<Time>[] = []
  let prev: number | undefined = states[0]
  for (let i = 1; i < len; i++) {
    const cur = states[i]
    if (cur === undefined || cur === prev) continue
    const dateStr = dates[i]
    if (!dateStr) continue
    const time = dateStringToTime(dateStr)
    if (time == null) continue
    const label = label_names?.[String(cur)] ?? `r${cur}`
    out.push({
      time,
      position: 'aboveBar',
      shape: 'circle',
      color,
      text: label,
    })
    prev = cur
  }
  out.sort((a, b) => compareTime(a.time, b.time))
  return out
}
