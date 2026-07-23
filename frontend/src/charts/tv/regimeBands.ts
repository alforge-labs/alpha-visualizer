/**
 * レジーム背景バンドを lightweight-charts の series primitive として描画する（issue #317）。
 *
 * #187 で visx 実装（`EquityChartV` の regime bands）を撤去した際、TV 版が
 * `regimeSeries` を silent に無視していたため機能が失われていた。
 * lightweight-charts は時間軸の背景塗り分けを標準提供しないが、
 * `ISeriesPrimitive` の `drawBackground` + `zOrder: 'bottom'` で
 * シリーズより下のレイヤーに直接描ける。
 *
 * 遷移点 marker（`trades.ts` の `regimeChangeMarkers`）ではなくバンドにしているのは、
 * 「各期間がどのレジームだったか」が一目で分かる旧 visx の情報量を保つため。
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'

import type { RegimeSeries } from '../../api/types'
import { hexToRgba } from './theme'
import { dateStringToTime } from './data'

/**
 * 描画対象のうち本 primitive が使う部分だけを構造的に型付けする。
 * 実体は fancy-canvas の `CanvasRenderingTarget2D` だが、lightweight-charts が
 * 再エクスポートしておらず、型のためだけに推移的依存を直接依存へ昇格させたくないため。
 */
interface MediaCoordinateScope {
  context: CanvasRenderingContext2D
  mediaSize: { width: number; height: number }
}
interface BackgroundDrawTarget {
  useMediaCoordinateSpace: (fn: (scope: MediaCoordinateScope) => void) => void
}

export interface RegimeBand {
  state: number
  /** バンド開始日（`dates` の要素をそのまま保持する） */
  from: string
  /** バンド終了日（同 state が続く最後の日。両端を含む） */
  to: string
}

export interface RegimeLegendEntry {
  state: number
  label: string
  color: string
}

/**
 * 隣接する同一 state を 1 本のバンドへ集約する。区間は両端を含む。
 * 例: states=[0,0,1,1,1,0] → 3 バンド
 */
export function buildRegimeBands(series: RegimeSeries | null | undefined): RegimeBand[] {
  if (!series) return []
  const { dates, states } = series
  if (!Array.isArray(dates) || !Array.isArray(states)) return []
  const len = Math.min(dates.length, states.length)
  if (len === 0) return []

  const bands: RegimeBand[] = []
  let curState = states[0] as number
  let curFrom = dates[0] as string
  let prevDate = dates[0] as string

  for (let i = 1; i < len; i++) {
    const s = states[i] as number
    const d = dates[i] as string
    if (s !== curState) {
      bands.push({ state: curState, from: curFrom, to: prevDate })
      curState = s
      curFrom = d
    }
    prevDate = d
  }
  bands.push({ state: curState, from: curFrom, to: prevDate })
  return bands
}

/**
 * state に対応する色（不透明）。palette 内なら palette、超える場合は state 数で
 * 等分した hue を使う。旧 visx 実装（`EquityChartV` の `regimeColor`）と同じ規則。
 * 凡例のスウォッチなど、そのまま見せる用途で使う。
 */
export function regimeBandColor(state: number, nStates: number, palette: readonly string[]): string {
  const c = palette[state]
  if (state >= 0 && state < palette.length && c) return c
  const safeN = Math.max(nStates, 1)
  return `hsl(${(state * 360) / safeN}, 55%, 55%)`
}

/**
 * 背景バンドの塗り色（半透明）。
 *
 * `hexToRgba` は hex 以外の文字列を素通しするため、palette を超える state の
 * hsl フォールバックをそのまま渡すと不透明な帯がチャートを覆ってしまう。
 * hsl 側は hsla を直接組み立てて必ず alpha が載るようにする。
 */
export function regimeBandFill(
  state: number,
  nStates: number,
  palette: readonly string[],
  alpha: number,
): string {
  const c = palette[state]
  if (state >= 0 && state < palette.length && c) return hexToRgba(c, alpha)
  const safeN = Math.max(nStates, 1)
  const a = Math.max(0, Math.min(1, alpha))
  return `hsla(${(state * 360) / safeN}, 55%, 55%, ${a})`
}

/** state の表示名。`label_names` が無ければ `S<state>` にフォールバックする。 */
export function regimeLabel(state: number, names?: Record<string, string>): string {
  return names?.[String(state)] ?? `S${state}`
}

export interface RegimeBandsPrimitive extends ISeriesPrimitive<Time> {
  // 本ファクトリは常に実装を返すため、基底の optional メンバを必須化して
  // 呼び出し側（テスト含む）で optional chaining を不要にする。
  attached: (param: SeriesAttachedParameter<Time>) => void
  detached: () => void
  paneViews: () => readonly IPrimitivePaneView[]
  /** チャート外に描く凡例（state 昇順・重複なし） */
  legend: () => RegimeLegendEntry[]
}

/**
 * レジーム背景バンドの primitive を生成する。
 *
 * @param series regime 系列（`BacktestDetail.regime_series`）
 * @param palette テーマの系列カラー（`ChartTheme.series`）
 * @param alpha バンドの不透明度。エクイティ線を隠さない程度に薄くする
 */
export function createRegimeBandsPrimitive(
  series: RegimeSeries | null | undefined,
  palette: readonly string[],
  alpha: number,
): RegimeBandsPrimitive {
  const bands = buildRegimeBands(series)
  const nStates = series?.n_states ?? 0
  let attachedParam: SeriesAttachedParameter<Time> | null = null

  const renderer: IPrimitivePaneRenderer = {
    // draw ではなく drawBackground を使う。シリーズ・グリッドより下に塗るため。
    draw: () => {},
    drawBackground: (target: BackgroundDrawTarget) => {
      const chart = attachedParam?.chart
      if (!chart || bands.length === 0) return
      const timeScale = chart.timeScale()

      target.useMediaCoordinateSpace((scope) => {
        const { context, mediaSize } = scope
        for (const band of bands) {
          const fromTime = dateStringToTime(band.from)
          const toTime = dateStringToTime(band.to)
          if (fromTime == null || toTime == null) continue
          const x1 = timeScale.timeToCoordinate(fromTime)
          const x2 = timeScale.timeToCoordinate(toTime)
          // 表示範囲外は座標が取れない。描かずにスキップする
          if (x1 == null || x2 == null) continue

          const left = Math.min(x1, x2)
          // 1 本しか点が無いバンドでも視認できるよう最低 1px は確保する
          const width = Math.max(1, Math.abs(x2 - x1))
          context.beginPath()
          context.fillStyle = regimeBandFill(band.state, nStates, palette, alpha)
          context.rect(left, 0, width, mediaSize.height)
          context.fill()
        }
      })
    },
  }

  const paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => renderer,
  }
  const paneViews = [paneView]

  return {
    attached: (param: SeriesAttachedParameter<Time>) => {
      attachedParam = param
    },
    detached: () => {
      attachedParam = null
    },
    // 参照の同一性を保つ（ライブラリが views をキャッシュするため）
    paneViews: () => paneViews,
    legend: () => {
      const seen = new Map<number, RegimeLegendEntry>()
      for (const band of bands) {
        if (seen.has(band.state)) continue
        seen.set(band.state, {
          state: band.state,
          label: regimeLabel(band.state, series?.label_names),
          color: regimeBandColor(band.state, nStates, palette),
        })
      }
      return [...seen.values()].sort((a, b) => a.state - b.state)
    },
  }
}
