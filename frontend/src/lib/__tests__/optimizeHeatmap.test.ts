import { describe, it, expect } from 'vitest'
import {
  numericParamNames,
  metricOptions,
  getTrialMetric,
  computeHeatmapGrid,
  type HeatmapTrialLike,
} from '../optimizeHeatmap'

function trial(
  params: Record<string, unknown>,
  metric: number,
  metrics: Record<string, unknown> = {},
): HeatmapTrialLike {
  return { params, metric, metrics }
}

describe('numericParamNames', () => {
  it('returns params whose values are always finite numbers, in first-seen order', () => {
    const trials = [
      trial({ sma_fast: 5, sma_slow: 20 }, 1.0),
      trial({ sma_fast: 10, sma_slow: 40 }, 0.5),
    ]
    expect(numericParamNames(trials)).toEqual(['sma_fast', 'sma_slow'])
  })

  it('excludes params with any non-numeric occurrence', () => {
    const trials = [
      trial({ sma_fast: 5, mode: 'ema' }, 1.0),
      trial({ sma_fast: 10, mode: 'sma' }, 0.5),
    ]
    expect(numericParamNames(trials)).toEqual(['sma_fast'])
  })

  it('excludes params that become non-numeric in a later trial', () => {
    const trials = [
      trial({ window: 5 }, 1.0),
      trial({ window: 'auto' }, 0.5),
    ]
    expect(numericParamNames(trials)).toEqual([])
  })

  it('excludes params with NaN or Infinity values', () => {
    const trials = [
      trial({ a: NaN, b: Infinity, c: 1 }, 1.0),
    ]
    expect(numericParamNames(trials)).toEqual(['c'])
  })

  it('includes params present in only a subset of trials when always numeric', () => {
    const trials = [
      trial({ a: 1 }, 1.0),
      trial({ a: 2, b: 3 }, 0.5),
    ]
    expect(numericParamNames(trials)).toEqual(['a', 'b'])
  })

  it('returns an empty array for empty trials', () => {
    expect(numericParamNames([])).toEqual([])
  })
})

describe('getTrialMetric', () => {
  it('returns the finite value from trial.metrics for a known key', () => {
    const t = trial({ a: 1 }, 1.2, { sharpe_ratio: 1.2, total_return_pct: 30 })
    expect(getTrialMetric(t, 'total_return_pct', 'sharpe_ratio')).toBe(30)
  })

  it('falls back to trial.metric when the key is the primary metric and missing from metrics', () => {
    const t = trial({ a: 1 }, 1.2, { total_return_pct: 30 })
    expect(getTrialMetric(t, 'sharpe_ratio', 'sharpe_ratio')).toBe(1.2)
  })

  it('returns null for an unknown key', () => {
    const t = trial({ a: 1 }, 1.2, { sharpe_ratio: 1.2 })
    expect(getTrialMetric(t, 'unknown_metric', 'sharpe_ratio')).toBeNull()
  })

  it('returns null when the metrics value is not a finite number', () => {
    const t = trial({ a: 1 }, 1.2, { weird: 'abc', nan: NaN })
    expect(getTrialMetric(t, 'weird', 'sharpe_ratio')).toBeNull()
    expect(getTrialMetric(t, 'nan', 'sharpe_ratio')).toBeNull()
  })
})

describe('metricOptions', () => {
  it('puts the primary metric first and appends metrics keys in encounter order', () => {
    const trials = [
      trial({ a: 1 }, 1.0, { sharpe_ratio: 1.0, total_return_pct: 10 }),
      trial({ a: 2 }, 0.5, { sharpe_ratio: 0.5, max_drawdown_pct: -8 }),
    ]
    expect(metricOptions('sharpe_ratio', trials)).toEqual([
      'sharpe_ratio',
      'total_return_pct',
      'max_drawdown_pct',
    ])
  })

  it('excludes keys whose values are never finite numbers', () => {
    const trials = [trial({ a: 1 }, 1.0, { note: 'text', sharpe_ratio: 1.0 })]
    expect(metricOptions('sharpe_ratio', trials)).toEqual(['sharpe_ratio'])
  })

  it('returns only the primary metric for empty trials', () => {
    expect(metricOptions('sharpe_ratio', [])).toEqual(['sharpe_ratio'])
  })
})

describe('computeHeatmapGrid', () => {
  it('creates one discrete bin per unique value when unique count <= maxBins', () => {
    const trials = [
      trial({ x: 5, y: 20 }, 1.0),
      trial({ x: 10, y: 20 }, 0.5),
      trial({ x: 5, y: 40 }, -0.5),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'sharpe_ratio',
      primaryMetricName: 'sharpe_ratio',
    })
    expect(grid.xBins.map((b) => b.label)).toEqual(['5', '10'])
    expect(grid.yBins.map((b) => b.label)).toEqual(['20', '40'])
  })

  it('averages the metric over trials that share the same cell', () => {
    const trials = [
      trial({ x: 5, y: 20 }, 1.0),
      trial({ x: 5, y: 20 }, 3.0),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    expect(grid.cells[0]![0]).toEqual({ mean: 2.0, count: 2 })
  })

  it('leaves cells without trials as null', () => {
    const trials = [
      trial({ x: 5, y: 20 }, 1.0),
      trial({ x: 10, y: 40 }, 0.5),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    // cells[yIndex][xIndex], bins 昇順
    expect(grid.cells[0]![0]).toEqual({ mean: 1.0, count: 1 })
    expect(grid.cells[0]![1]).toBeNull()
    expect(grid.cells[1]![0]).toBeNull()
    expect(grid.cells[1]![1]).toEqual({ mean: 0.5, count: 1 })
  })

  it('computes min/max over cell means', () => {
    const trials = [
      trial({ x: 5, y: 20 }, 1.0),
      trial({ x: 10, y: 20 }, -2.0),
      trial({ x: 5, y: 40 }, 4.0),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    expect(grid.min).toBe(-2.0)
    expect(grid.max).toBe(4.0)
  })

  it('bins continuous values into maxBins equal-width ranges', () => {
    // x の unique 値 10 個 (0..9) > maxBins 4 → 幅 2.25 のレンジビン
    const trials = Array.from({ length: 10 }, (_, i) =>
      trial({ x: i, y: 1 }, i),
    )
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
      maxBins: 4,
    })
    expect(grid.xBins).toHaveLength(4)
    expect(grid.xBins[0]!.lo).toBe(0)
    expect(grid.xBins[3]!.hi).toBe(9)
    expect(grid.xBins[0]!.label).toBe('0–2.25')
    // 最大値 9 は最終ビンに入る
    // bin0: 0,1,2 / bin1: 3,4 / bin2: 5,6 / bin3: 7,8,9
    expect(grid.cells[0]!.map((c) => c?.count ?? 0)).toEqual([3, 2, 2, 3])
    expect(grid.cells[0]![3]!.mean).toBe(8)
  })

  it('uses the metricKey to read values from trial.metrics', () => {
    const trials = [
      trial({ x: 5, y: 20 }, 1.0, { total_return_pct: 30 }),
      trial({ x: 5, y: 20 }, 2.0, { total_return_pct: 10 }),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'total_return_pct',
      primaryMetricName: 'sharpe_ratio',
    })
    expect(grid.cells[0]![0]).toEqual({ mean: 20, count: 2 })
  })

  it('excludes trials whose metric value is not finite', () => {
    const trials = [
      trial({ x: 5, y: 20 }, NaN),
      trial({ x: 5, y: 20 }, 1.0),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    expect(grid.cells[0]![0]).toEqual({ mean: 1.0, count: 1 })
  })

  it('excludes trials missing the x or y param', () => {
    const trials = [
      trial({ x: 5 }, 1.0),
      trial({ y: 20 }, 1.0),
      trial({ x: 5, y: 20 }, 2.0),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    expect(grid.xBins).toHaveLength(1)
    expect(grid.yBins).toHaveLength(1)
    expect(grid.cells[0]![0]).toEqual({ mean: 2.0, count: 1 })
  })

  it('returns an empty grid when no trial is plottable', () => {
    const grid = computeHeatmapGrid([], {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    expect(grid.xBins).toEqual([])
    expect(grid.yBins).toEqual([])
    expect(grid.cells).toEqual([])
    expect(grid.min).toBeNull()
    expect(grid.max).toBeNull()
  })

  it('supports an axis with a single unique value', () => {
    const trials = [
      trial({ x: 5, y: 20 }, 1.0),
      trial({ x: 5, y: 40 }, 2.0),
    ]
    const grid = computeHeatmapGrid(trials, {
      xParam: 'x',
      yParam: 'y',
      metricKey: 'm',
      primaryMetricName: 'm',
    })
    expect(grid.xBins.map((b) => b.label)).toEqual(['5'])
    expect(grid.yBins).toHaveLength(2)
  })
})
