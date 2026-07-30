import { describe, it, expect } from 'vitest'
import { METRIC_DEFINITIONS } from '../metricDefinitions'

/**
 * issue #360: 初級者が最も意味を知らない詳細指標群にこそ説明がない逆転状態を解消する。
 * MetricsGrid / SignalQualityBadge / MetricsSummaryBarV2 で表示される全指標に
 * 日英の定義があることを、表示側の実装と独立に保証する。
 */

// MetricsGrid（KPI + 詳細カード + ベンチマーク）で表示される指標キー
const GRID_KEYS = [
  'total_return_pct',
  'sharpe_ratio',
  'max_drawdown_pct',
  'win_rate_pct',
  'cagr_pct',
  'sortino_ratio',
  'calmar_ratio',
  'profit_factor',
  'total_trades',
  'avg_holding_days',
  'omega_ratio',
  'tail_ratio',
  'var_95_pct',
  'cvar_95_pct',
  'exposure_pct',
  'positive_month_ratio',
  'max_consecutive_wins',
  'max_consecutive_losses',
  'avg_win_pct',
  'avg_loss_pct',
  'max_drawdown_duration_days',
  'recovery_days',
  'alpha_pct',
  'beta',
  'information_ratio',
  'correlation',
  'benchmark_total_return_pct',
  'benchmark_cagr_pct',
] as const

// コスト・上級指標セクションで表示される指標キー（issue #368）
const COST_ADVANCED_KEYS = [
  'gross_return_pct',
  'net_return_pct',
  'cost_drag_pct',
  'total_commission_paid',
  'total_slippage_cost',
  'kelly_criterion',
  'expectancy_pct',
  'payoff_ratio',
  'gain_to_pain_ratio',
  'ulcer_index',
  'serenity_index',
  'recovery_factor',
  'win_rate_ci',
] as const

// SignalQualityBadge で表示される指標キー
const SIGNAL_KEYS = [
  'signal_quality_score',
  'probabilistic_sr',
  'deflated_sr',
  'n_trials',
] as const

function mustGet(key: string) {
  const def = METRIC_DEFINITIONS[key]
  if (!def) throw new Error(`${key} の定義がない`)
  return def
}

describe('METRIC_DEFINITIONS の全指標カバレッジ (issue #360)', () => {
  it.each([...GRID_KEYS, ...SIGNAL_KEYS, ...COST_ADVANCED_KEYS])('%s に日英の説明がある', (key) => {
    const def = mustGet(key)
    expect(def.description.length).toBeGreaterThan(0)
    expect(def.descriptionEn.length).toBeGreaterThan(0)
    expect(def.label.length).toBeGreaterThan(0)
    expect(def.labelEn.length).toBeGreaterThan(0)
  })
})

describe('説明文の目安値が UI の色分けしきい値と同期している (issue #360)', () => {
  // UI の色分け根拠（evaluate.ts / MetricsSummaryBarV2 の tone）と同じ数値を
  // 説明文にも含める。しきい値だけ変更して説明が古いままになる drift を防ぐ。
  it('Max DD は 15 / 30 の閾値を説明する', () => {
    const d = mustGet('max_drawdown_pct')
    expect(d.description).toMatch(/15/)
    expect(d.description).toMatch(/30/)
    expect(d.descriptionEn).toMatch(/15/)
    expect(d.descriptionEn).toMatch(/30/)
  })
  it('勝率は 45 / 55 の閾値を説明する', () => {
    const d = mustGet('win_rate_pct')
    expect(d.description).toMatch(/55/)
    expect(d.description).toMatch(/45/)
  })
  it('PF は損益分岐 1.0 と良好 1.5 を説明する', () => {
    const d = mustGet('profit_factor')
    expect(d.description).toMatch(/1\.0/)
    expect(d.description).toMatch(/1\.5/)
  })
  it('Sharpe は 1.0 の目安を説明する', () => {
    expect(mustGet('sharpe_ratio').description).toMatch(/1\.0/)
  })
})
