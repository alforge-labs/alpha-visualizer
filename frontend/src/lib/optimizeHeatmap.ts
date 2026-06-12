/**
 * 最適化トライアルのヒートマップ用ビニング・集約ユーティリティ。
 *
 * trial 群を X パラメータ × Y パラメータのグリッドにビニングし、
 * 各セルにメトリクスの平均値（mean）と件数（count）を集約する。
 *
 * - ユニーク値が {@link DEFAULT_MAX_BINS} 以下の軸は値そのものを離散ビンにする
 * - 超える場合は等幅レンジビン（`lo–hi` ラベル）に分割する
 * - 数値でないパラメータ値・非有限のメトリクス値を持つ trial は除外する
 */

/** ヒートマップ計算に必要な最小の trial 形状（`OptimizeTrial` 互換）。 */
export interface HeatmapTrialLike {
  params: Record<string, unknown>
  metric: number
  metrics: Record<string, unknown>
}

/** 1 軸のビン。離散ビンでは `lo === hi`（値そのもの）。 */
export interface HeatmapBin {
  /** 表示ラベル（離散ビンは値、レンジビンは `lo–hi`） */
  label: string
  /** ビン下端 */
  lo: number
  /** ビン上端（レンジビンの最終ビンはデータ最大値） */
  hi: number
}

/** グリッドの 1 セル（同一ビン組合せに入った trial の集約値）。 */
export interface HeatmapCell {
  /** メトリクスの平均値 */
  mean: number
  /** セルに入った trial 数 */
  count: number
}

export interface HeatmapGrid {
  /** X 軸ビン（昇順） */
  xBins: HeatmapBin[]
  /** Y 軸ビン（昇順） */
  yBins: HeatmapBin[]
  /** `cells[yIndex][xIndex]`。trial が無いセルは `null` */
  cells: (HeatmapCell | null)[][]
  /** セル mean の最小値（セルが無いときは `null`） */
  min: number | null
  /** セル mean の最大値（セルが無いときは `null`） */
  max: number | null
}

export interface HeatmapGridOptions {
  xParam: string
  yParam: string
  /** 集約対象メトリクスのキー（`trial.metrics` のキー、または primary） */
  metricKey: string
  /** 最適化の主メトリクス名（`trial.metric` へのフォールバックに使用） */
  primaryMetricName: string
  /** 1 軸あたりの最大ビン数（既定 {@link DEFAULT_MAX_BINS}） */
  maxBins?: number
}

export const DEFAULT_MAX_BINS = 10

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * ヒートマップ軸に使える数値パラメータ名を返す。
 *
 * 「いずれかの trial に存在し、存在するすべての trial で有限数値」である
 * パラメータのみを、初出順で返す。
 */
export function numericParamNames(trials: readonly HeatmapTrialLike[]): string[] {
  const ordered: string[] = []
  const invalid = new Set<string>()
  for (const t of trials) {
    for (const [name, value] of Object.entries(t.params)) {
      if (!ordered.includes(name)) ordered.push(name)
      if (!isFiniteNumber(value)) invalid.add(name)
    }
  }
  return ordered.filter((name) => !invalid.has(name))
}

/**
 * trial から対象メトリクスの値を読み取る。
 *
 * - `trial.metrics[metricKey]` が有限数値ならそれを返す
 * - `metricKey` が主メトリクスなら `trial.metric` にフォールバック
 * - それ以外は `null`（計算不能）
 */
export function getTrialMetric(
  trial: HeatmapTrialLike,
  metricKey: string,
  primaryMetricName: string,
): number | null {
  const v = trial.metrics[metricKey]
  if (isFiniteNumber(v)) return v
  if (metricKey === primaryMetricName && isFiniteNumber(trial.metric)) {
    return trial.metric
  }
  return null
}

/**
 * メトリクス選択肢を返す。主メトリクスを先頭に、`trial.metrics` のうち
 * 有限数値を 1 件以上持つキーを初出順で追加する（重複排除）。
 */
export function metricOptions(
  primaryMetricName: string,
  trials: readonly HeatmapTrialLike[],
): string[] {
  const out: string[] = [primaryMetricName]
  for (const t of trials) {
    for (const [key, value] of Object.entries(t.metrics)) {
      if (!isFiniteNumber(value)) continue
      if (!out.includes(key)) out.push(key)
    }
  }
  return out
}

function fmtBinValue(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return String(Number(v.toPrecision(3)))
}

interface AxisBinning {
  bins: HeatmapBin[]
  indexOf: (v: number) => number
}

/** ユニーク値（昇順）から離散ビンまたは等幅レンジビンを構築する。 */
function makeAxisBinning(sortedUnique: readonly number[], maxBins: number): AxisBinning {
  if (sortedUnique.length === 0) {
    return { bins: [], indexOf: () => -1 }
  }
  if (sortedUnique.length <= maxBins) {
    const bins = sortedUnique.map((v) => ({ label: fmtBinValue(v), lo: v, hi: v }))
    const idx = new Map(sortedUnique.map((v, i) => [v, i]))
    return { bins, indexOf: (v) => idx.get(v) ?? -1 }
  }
  const min = sortedUnique[0]!
  const max = sortedUnique[sortedUnique.length - 1]!
  const width = (max - min) / maxBins
  const bins = Array.from({ length: maxBins }, (_, i) => {
    const lo = min + width * i
    const hi = i === maxBins - 1 ? max : min + width * (i + 1)
    return { label: `${fmtBinValue(lo)}–${fmtBinValue(hi)}`, lo, hi }
  })
  return {
    bins,
    indexOf: (v) => Math.min(maxBins - 1, Math.max(0, Math.floor((v - min) / width))),
  }
}

/**
 * trial 群を X×Y グリッドにビニングし、セルごとにメトリクス平均を集約する。
 *
 * 除外条件: x/y パラメータが欠落・非数値、またはメトリクス値が非有限の trial。
 */
export function computeHeatmapGrid(
  trials: readonly HeatmapTrialLike[],
  options: HeatmapGridOptions,
): HeatmapGrid {
  const { xParam, yParam, metricKey, primaryMetricName } = options
  const maxBins = options.maxBins ?? DEFAULT_MAX_BINS

  const points: { x: number; y: number; value: number }[] = []
  for (const t of trials) {
    const x = t.params[xParam]
    const y = t.params[yParam]
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue
    const value = getTrialMetric(t, metricKey, primaryMetricName)
    if (value === null) continue
    points.push({ x, y, value })
  }

  if (points.length === 0) {
    return { xBins: [], yBins: [], cells: [], min: null, max: null }
  }

  const xAxis = makeAxisBinning([...new Set(points.map((p) => p.x))].sort((a, b) => a - b), maxBins)
  const yAxis = makeAxisBinning([...new Set(points.map((p) => p.y))].sort((a, b) => a - b), maxBins)

  const sums = Array.from({ length: yAxis.bins.length }, () =>
    Array.from({ length: xAxis.bins.length }, () => ({ sum: 0, count: 0 })),
  )
  for (const p of points) {
    const xi = xAxis.indexOf(p.x)
    const yi = yAxis.indexOf(p.y)
    if (xi < 0 || yi < 0) continue
    const acc = sums[yi]![xi]!
    acc.sum += p.value
    acc.count += 1
  }

  let min: number | null = null
  let max: number | null = null
  const cells: (HeatmapCell | null)[][] = sums.map((row) =>
    row.map((acc) => {
      if (acc.count === 0) return null
      const mean = acc.sum / acc.count
      if (min === null || mean < min) min = mean
      if (max === null || mean > max) max = mean
      return { mean, count: acc.count }
    }),
  )

  return { xBins: xAxis.bins, yBins: yAxis.bins, cells, min, max }
}
