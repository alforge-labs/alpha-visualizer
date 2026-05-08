import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { OptimizeTrial } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'
import {
  OptimizeScatterV,
  type OptimizeScatterPoint,
} from '../../charts/visx/OptimizeScatterV'

interface OptimizeScatterProps {
  trials: OptimizeTrial[]
  xParam: string
  metricName: string
  lang: Lang
  compact: boolean
}

/**
 * 最適化トライアル散布図 (Container)。
 *
 * 役割:
 * - trials のうち xParam を持つものに絞り、整形済みポイント列を生成
 * - 集計値（試行数 / 合格 / 不合格）を計算
 * - i18n / theme を解決して Presentational に渡す
 *
 * 描画は ``OptimizeScatterV`` (charts/visx/) に委譲する（ADR-0002）。
 */
export function OptimizeScatter({
  trials,
  xParam,
  metricName,
  lang,
  compact,
}: OptimizeScatterProps): React.ReactElement {
  const L = makeL(lang)
  const theme = useChartTheme()

  const valid = trials.filter((t) => xParam in t.params)
  const points: OptimizeScatterPoint[] = valid.map((t) => ({
    x: t.params[xParam] ?? 0,
    y: t.metric,
    pass: t.pass,
    params: t.params,
  }))
  const passCount = valid.filter((t) => t.pass).length
  const summary: ReadonlyArray<readonly [string, string | number, string]> = [
    [L('試行数', 'Trials'), valid.length, 'var(--text3)'],
    [L('合格', 'Pass'), passCount, theme.success],
    [L('不合格', 'Fail'), valid.length - passCount, theme.danger],
  ]

  return (
    <OptimizeScatterV
      points={points}
      xLabel={xParam}
      yLabel={metricName.replace(/_/g, ' ')}
      summary={summary}
      height={compact ? 260 : 320}
    />
  )
}
