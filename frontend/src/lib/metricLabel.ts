/**
 * 最適化指標名（`WFOResult.metric_name` 等）の表示ラベル（vis#303）。
 *
 * forge#1293 以降、WFT は sharpe_ratio 以外の指標でも保存されるため、
 * 「Sharpe」固定ラベルのまま別指標の値を表示すると誤ラベルになる。
 * 既知の指標は短い表示名へ、未知の指標は生名のまま返す（誤訳よりも正確さ優先）。
 */
const METRIC_LABELS: Record<string, string> = {
  sharpe_ratio: 'Sharpe',
  sortino_ratio: 'Sortino',
  calmar_ratio: 'Calmar',
  cagr_pct: 'CAGR',
}

export function metricShortLabel(metricName: string | null | undefined): string {
  if (!metricName) return 'Sharpe'
  return METRIC_LABELS[metricName] ?? metricName
}
