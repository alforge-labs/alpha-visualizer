import { useMemo } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { OptimizeTrial } from '../../api/types'
import { computeHeatmapGrid } from '../../lib/optimizeHeatmap'
import { OptimizeHeatmapV } from '../../charts/visx/OptimizeHeatmapV'

interface OptimizeHeatmapProps {
  trials: OptimizeTrial[]
  xParam: string
  yParam: string
  /** 集約対象メトリクスのキー（`trial.metrics` のキー、または主メトリクス名） */
  metricKey: string
  /** 最適化の主メトリクス名（`trial.metric` フォールバック用） */
  primaryMetricName: string
  lang: Lang
  compact: boolean
}

/**
 * 最適化トライアルヒートマップ (Container)。
 *
 * 役割:
 * - trials を X×Y グリッドにビニング・平均集約（``lib/optimizeHeatmap`` に委譲）
 * - 集約結果が空のときの説明メッセージ表示
 * - i18n を解決して Presentational に渡す
 *
 * 描画は ``OptimizeHeatmapV`` (charts/visx/) に委譲する（ADR-0002）。
 */
export function OptimizeHeatmap({
  trials,
  xParam,
  yParam,
  metricKey,
  primaryMetricName,
  lang,
  compact,
}: OptimizeHeatmapProps): React.ReactElement {
  const L = makeL(lang)
  const grid = useMemo(
    () => computeHeatmapGrid(trials, { xParam, yParam, metricKey, primaryMetricName }),
    [trials, xParam, yParam, metricKey, primaryMetricName],
  )
  const metricLabel = metricKey.replace(/_/g, ' ')

  if (grid.min === null) {
    return (
      <div
        data-testid="optimize-heatmap-empty"
        style={{
          padding: 'var(--space-5) 0',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
          color: 'var(--text3)',
        }}
      >
        {L(
          'この組み合わせで表示できるトライアルがありません',
          'No trials available for this combination',
        )}
      </div>
    )
  }

  return (
    <div data-testid="optimize-heatmap">
      <OptimizeHeatmapV
        grid={grid}
        xLabel={xParam}
        yLabel={yParam}
        metricLabel={metricLabel}
        compact={compact}
      />
      <div
        style={{
          marginTop: 8,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
          color: 'var(--text3)',
        }}
      >
        {L(
          `セル = ${metricLabel} の平均値（同一組合せの複数トライアルは平均）`,
          `Cell = mean ${metricLabel} (multiple trials per combination are averaged)`,
        )}
      </div>
    </div>
  )
}
