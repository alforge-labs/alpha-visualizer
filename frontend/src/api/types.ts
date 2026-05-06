export interface BacktestMetrics {
  total_return_pct: number
  cagr_pct: number
  sharpe_ratio: number
  sortino_ratio: number
  calmar_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  profit_factor: number
  total_trades: number
  avg_holding_days?: number
  max_drawdown_duration_days?: number
  recovery_days?: number | null
  max_consecutive_wins?: number
  max_consecutive_losses?: number
  avg_win_pct?: number
  avg_loss_pct?: number
  tail_ratio?: number
  var_95_pct?: number
  exposure_pct?: number
  positive_month_ratio?: number
  omega_ratio?: number
  skewness?: number
  excess_kurtosis?: number
  cvar_95_pct?: number
  deflated_sharpe?: {
    probabilistic_sr: number
    deflated_sr: number
    n_trials: number
    skewness?: number
    excess_kurtosis?: number
  }
  statistical_validity?: {
    is_valid: boolean
    signal_quality_score: number
    warning: string | null
  }
  annual_returns: Record<string, number>
  benchmark?: {
    alpha_pct: number
    beta: number
    information_ratio: number
    correlation: number
    benchmark_total_return_pct: number
    benchmark_cagr_pct: number
  }
}

export interface Trade {
  id: number
  direction: 'long' | 'short'
  entry_date: string
  exit_date: string
  entry_price: number
  return_pct: number
  pnl: number
  holding_days: number
  mae_pct: number
  mfe_pct: number
}

export interface MonthlyReturns {
  [year: number]: (number | null)[]
}

export interface RegimeSeries {
  dates: string[]
  states: number[]
  n_states: number
  label_names?: Record<string, string>
}

export interface RegimePeriodStats {
  label: string
  start: string
  end: string
  sharpe: number
  win_rate_pct: number
  total_trades: number
  max_drawdown_pct: number
}

export interface RegimeAggregateStats {
  sharpe_avg: number
  win_rate_avg: number
  trades_total: number
  max_drawdown_avg: number
}

export interface RegimeBreakdown {
  method: string
  description: string
  periods: RegimePeriodStats[]
  aggregates: Record<string, RegimeAggregateStats>
}

export interface BacktestDetail {
  run_id: string
  strategy_id: string
  strategy_name: string
  symbol: string
  timeframe: string
  run_at: string
  period: { start: string; end: string }
  equity: { dates: string[]; values: number[]; benchmark?: number[] }
  drawdown: number[]
  is_cutoff: { date: string | null; index: number }
  metrics: BacktestMetrics
  is_metrics: BacktestMetrics | null
  oos_metrics: BacktestMetrics | null
  monthly_returns: MonthlyReturns
  trades: Trade[]
  daily_returns: number[]
  buy_hold_equity: number[]
  benchmark_annual_returns: Record<string, number>
  regime_series?: RegimeSeries
  regime_breakdown?: RegimeBreakdown
}

export interface WFOWindow {
  id: number
  label: string
  is_start: string
  is_end: string
  oos_start: string
  oos_end: string
  is_sharpe: number
  oos_sharpe: number
  is_return: number
  oos_return: number
  oos_is_ratio: number
  params: Record<string, number>
  pass: boolean
}

export interface WFOResult {
  strategy_id: string
  strategy_name: string
  symbol: string
  windows: WFOWindow[]
  composite_equity: number[]
  composite_dates: string[]
}

export interface StrategyComparison {
  id: string
  name: string
  symbol: string
  total_return_pct: number
  cagr_pct: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  profit_factor: number
  total_trades: number
  is_baseline: boolean
  equity?: { dates: string[]; values: number[] }
  daily_returns?: number[]
}

export interface StrategyListItem {
  strategy_id: string
  name: string
  // 以下は backend が必ず返すとは限らない（バックテスト履歴がない場合や、
  // API 拡張が未追従のときは undefined になる）。表示側は null/undefined 両対応する。
  symbol?: string | null
  timeframe?: string | null
  tags?: string[] | null
  target_symbols?: string[] | null
  latest_sharpe?: number | null
  latest_return_pct?: number | null
  latest_max_drawdown_pct?: number | null
  latest_profit_factor?: number | null
  latest_win_rate_pct?: number | null
  latest_total_trades?: number | null
  last_run_at?: string | null
}

export interface StrategyRun {
  run_id: string
  run_at: string
  sharpe_ratio: number | null
  total_return_pct: number | null
  max_drawdown_pct: number | null
}

export interface OptimizeTrial {
  params: Record<string, number>
  metric: number
  pass: boolean
  metrics: Record<string, number>
}

export interface OptimizeResult {
  strategy_id: string
  run_at: string
  metric_name: string
  best_metric: number
  trials: OptimizeTrial[]
}

export interface IndicatorConfig {
  id: string
  type: string
  params: Record<string, unknown>
  lock_on_entry: boolean
}

export interface VariableConfig {
  id: string
  expression: string
  [key: string]: unknown
}

export interface ConditionNode {
  type: string
  conditions?: ConditionNode[]
  left?: string
  right?: unknown
  [key: string]: unknown
}

export interface EntryExitConditions {
  long?: ConditionNode
  short?: ConditionNode
  [key: string]: ConditionNode | undefined
}

export interface RiskManagement {
  sl_pct?: number | null
  tp_pct?: number | null
  trailing_stop?: boolean
  position_size_pct?: number | null
  max_positions?: number | null
  [key: string]: unknown
}

export interface StrategyDetail {
  strategy_id: string
  name: string
  parameters: Record<string, unknown>
  indicators: IndicatorConfig[]
  variables: VariableConfig[]
  entry_conditions: EntryExitConditions | null
  exit_conditions: EntryExitConditions | null
  risk_management: RiskManagement | null
  regime_config: Record<string, unknown> | null
  results: StrategyRun[]
  optimization_history: Array<{ trial: number; best_sharpe: number; run_at: string; n_trials: number }>
}

export interface LinkedRun {
  strategy_id: string
  run_id: string
  notes?: string
}

export interface IdeaItem {
  idea_id: string
  title?: string
  description?: string
  status?: string
  idea_type?: string
  tags?: string[]
  created_at?: string
  updated_at?: string
  linked_strategies?: string[]
  linked_runs?: LinkedRun[]
  result_summary?: string | null
  notes_history?: string[]
}
