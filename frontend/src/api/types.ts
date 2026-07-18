/**
 * フロントエンド向け API 型定義。
 *
 * 段階的に `types.gen.ts`（OpenAPI 自動生成）に移行中（[ADR-0003](../../../docs/adr/0003-openapi-typescript-codegen.md)）。
 *
 * 本ファイルは:
 * 1. 単純な構造体は `types.gen.ts` の生成型を **alias** として再 export
 * 2. backend の Pydantic でモデル化されていない型・派生型・union 型は **手書き継続**
 *
 * 大きな型（BacktestDetail / StrategyDetail / LiveDetailResponse 等）は
 * 生成型に Pydantic ``extra=\"allow\"`` 由来の ``& { [key: string]: unknown }`` が
 * 付与されており、``Omit`` で扱おうとするとフィールド型が ``unknown`` 化するため
 * 手書き継続とする（CI の OpenAPI drift check で間接的に同期を担保）。
 */
import type { components } from './types.gen'

type S = components['schemas']

// ===== 1. 生成型 alias（単純な構造体・名前一致） =====

export type Period = S['Period']
export type IsCutoff = S['IsCutoff']
export type WFOWindow = S['WFOWindow']
export type LivePeriod = S['LivePeriod']
export type LiveListItem = S['LiveListItem']
export type LiveDiff = S['LiveDiff']
export type StrategyComparison = S['StrategyComparison']
export type OptimizationHistoryEntry = S['OptimizationHistoryEntry']
// OHLC 時系列（#189 で backend に追加、#190 で frontend から利用開始）
export type OhlcBar = S['OhlcBar']
export type HistoricalResponse = S['HistoricalResponse']

// ===== 2. 名前違いの alias（生成型と手書きで命名が異なるが shape 同一） =====

/** backend では ``WFOResponse`` だが、フロントは履歴的に ``WFOResult`` で参照する。 */
export type WFOResult = S['WFOResponse']

/** backend では ``StrategySummary`` だが、フロントは ``StrategyListItem`` で参照する。 */
export type StrategyListItem = S['StrategySummary']

/** backend では ``LiveSection`` から派生した ``LiveBacktest`` だが、フロントは ``LiveBacktestSection`` で参照する。 */
export type LiveBacktestSection = S['LiveBacktest']

/** backend では ``LiveAligned`` だが、フロントは ``LiveBacktestAligned`` で参照する。 */
export type LiveBacktestAligned = S['LiveAligned']

// ===== 3. 手書き継続（独自フィールド・厳密化・union 型・backend 未モデル化） =====

/**
 * BacktestMetrics: backend は ``metrics: dict[str, Any]`` で型付けしておらず、
 * フロントが消費するために独自定義。詳細指標は alpha-forge 側で動的に増減する。
 */
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

/**
 * Trade: 生成型 (`Trade`) は ``id: int | str`` / ``direction: str`` だが、
 * フロントは ``id: number`` / ``direction: 'long' | 'short'`` に narrow して扱う。
 *
 * `exit_price` / `sl_price` / `tp_price` は TradingView lightweight-charts の
 * markers / priceLine 表示用フィールド（issue #189）。alpha-forge 側で値が
 * 出力されていない場合は `null` になる。
 */
export interface Trade {
  id: number
  direction: 'long' | 'short'
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price?: number | null
  sl_price?: number | null
  tp_price?: number | null
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

/**
 * BacktestDetail: 生成型は ``metrics: dict[str, Any]``（Pydantic ``extra="allow"``）だが
 * フロントは ``BacktestMetrics`` で詳細型を持つ。``equity`` にもフロント独自の
 * ``benchmark?: number[]`` がある。生成型の Pydantic ``extra="allow"`` 由来の
 * ``& { [key: string]: unknown }`` が ``Omit`` 経由でフィールド型を unknown 化させる
 * ため、手書きを継続する。
 */
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
  /** 実行元 provenance（"strategy" / "strategy-file" / null=不明・vis#299） */
  source?: string | null
}

export interface StrategyRun {
  run_id: string
  run_at: string
  sharpe_ratio: number | null
  total_return_pct: number | null
  max_drawdown_pct: number | null
  /** 実行元 provenance（"strategy" / "strategy-file" / null=不明・vis#299） */
  source: string | null
}

export interface RunBacktestResult {
  run_id: string
  status: string
  /** forge 実行ログの末尾（stderr）。空のときは null */
  log_tail: string | null
}

export type JobKind = 'backtest' | 'optimize' | 'wft'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface JobSummary {
  job_id: string
  kind: string
  strategy_id: string
  symbol: string
  status: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  error: string | null
}

export interface JobDetail extends JobSummary {
  returncode: number | null
  /** stdout JSON のスカラー要約（equity_curve 等の巨大配列は backend で除去済み） */
  result: Record<string, unknown> | null
  log_tail: string | null
}

export interface CreateJobParams {
  kind: JobKind
  strategy_id: string
  symbol: string
  /** optimize のみ有効（省略時は forge 既定値） */
  trials?: number
  /** wft のみ有効（省略時は forge 既定値 5） */
  windows?: number
  /** backtest のみ有効: 指定キーだけ上書きしたチューニング実行（元定義は不変） */
  parameters?: Record<string, unknown>
}

export interface SaveParametersResult {
  status: string
  parameters: Record<string, unknown>
  log_tail: string | null
}

/**
 * OptimizeTrial: backend は ``pass`` キーが Python 予約語のため
 * Pydantic 明示フィールドにできず、生成型に含まれない（``extra="allow"`` 経由で透過）。
 * フロント側は ``pass: boolean`` を明示する手書き型を維持する。
 */
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
  best_metric: number | null
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
  // forge.yaml で任意指定可能なメタ情報（後方互換のため optional）
  name?: string
  description?: string
}

// 条件ノードは論理結合 (AND/OR) と比較・関数呼び出し等のリーフに大別される。
// 詳細な設計判断は ADR-0004 (docs/adr/0004-condition-node-discriminated-union.md) を参照。
//
// 重要な契約:
//   - backend (alpha-forge) の戦略バリデータが「リーフノードの type に
//     'AND' / 'OR' は含まれない」ことを保証する。
//   - フロント側のコードは必ず ``isLogicalConditionNode`` 型ガード経由で
//     narrowing すること（直接 ``node.type === 'AND'`` で分岐しない）。
//   - TS の構造的型システムでは ``LeafConditionNode.type: string`` が
//     ``'AND' | 'OR'`` も受理してしまうが、これは backend 契約 + 型ガードの
//     2 層で実害なく扱う設計判断（ADR-0004 の案 A/B/C と比較した結論）。
export type LogicalOperator = 'AND' | 'OR'

export interface LogicalConditionNode {
  type: LogicalOperator
  conditions: ConditionNode[]
}

export interface LeafConditionNode {
  // operator 名 ('CROSS_OVER', '>', 'sma_cross' 等) や関数名が入る。
  // backend (alpha-forge) の strategy schema 側で動的に決まるため string に保つ。
  // backend 契約により 'AND' / 'OR' は含まれない（ADR-0004 参照）。
  type: string
  left?: string
  right?: string | number | boolean | null
}

export type ConditionNode = LogicalConditionNode | LeafConditionNode

/**
 * ConditionNode が論理結合（AND/OR）か判定する narrowing 用 type guard。
 *
 * **必ずこのガード経由で narrow すること**。直接 ``node.type === 'AND'`` で
 * 分岐すると、TS の構造的型では LeafConditionNode 側の string も理論上
 * マッチしてしまうため（ADR-0004 参照）。
 */
export function isLogicalConditionNode(node: ConditionNode): node is LogicalConditionNode {
  return node.type === 'AND' || node.type === 'OR'
}

export interface EntryExitConditions {
  long?: ConditionNode
  short?: ConditionNode
}

export interface RiskManagement {
  sl_pct?: number | null
  tp_pct?: number | null
  trailing_stop?: boolean
  position_size_pct?: number | null
  max_positions?: number | null
}

/**
 * StrategyDetail: backend では ``entry_conditions`` 等が ``Any`` 型のため
 * 生成型では ``unknown`` 相当。フロントは ``ConditionNode`` で型付けして扱う。
 */
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
  optimization_history: Array<{
    trial: number
    best_sharpe: number
    run_at: string
    n_trials: number
  }>
}

export interface LinkedRun {
  strategy_id: string
  run_id: string
  notes?: string
}

/**
 * IdeaItem: 生成型 ``Idea`` には ``description`` / ``linked_runs`` /
 * ``result_summary`` / ``notes_history`` が含まれていない（backend Pydantic で
 * Optional フィールド差分）。フロントは ideas.json 由来のフルセットを扱う。
 */
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

// ===== Live (issue #57) =====

/**
 * position ベース combine portfolio の live metrics
 * （backend ``services/live.py`` の ``position_detail`` 互換）。
 *
 * ``max_drawdown_pct`` / ``volatility_pct`` は **正値**（大きいほど悪い）。
 * trade 単位の ``LiveSummary.max_drawdown_pct``（負値）と符号規約が異なる点に注意。
 */
export interface LivePositionMetrics {
  total_return_pct?: number | null
  cagr_pct?: number | null
  sharpe_ratio?: number | null
  max_drawdown_pct?: number | null
  volatility_pct?: number | null
}

/** LiveSummary: backend 側は ``LiveSection.summary: dict[str, unknown]`` のため手書き。 */
export interface LiveSummary {
  strategy_id: string
  strategy_version?: string | null
  snapshot_id?: string | null
  broker?: string | null
  total_trades?: number
  win_rate_pct?: number
  gross_pnl?: number
  net_pnl?: number
  profit_factor?: number
  avg_win?: number
  avg_loss?: number
  avg_slippage_bps?: number
  total_commission?: number
  max_drawdown_pct?: number
  symbols?: string[]
  /** 'position' = combine portfolio（``live_position_summaries`` 由来、#221） */
  kind?: 'strategy' | 'position'
  portfolio_id?: string | null
  metrics?: LivePositionMetrics | null
  backtest_metrics?: LivePositionMetrics | null
  /** ``[[ISO 日時, equity 値], ...]`` の日次系列 */
  equity?: [string, number][]
  receipts_count?: number | null
  sub_strategies?: string[]
  updated_at?: string | null
}

/** LiveTrade: ``side: 'long' | 'short'`` に narrow（生成型は string）。 */
export interface LiveTrade {
  trade_id: string
  symbol: string
  side: 'long' | 'short'
  entry_at: string
  exit_at: string
  qty: number
  entry_price: number
  exit_price: number
  net_pnl: number
  return_pct?: number | null
  exit_reason?: string | null
}

export interface LiveDetailResponse {
  strategy_id: string
  live: {
    summary: LiveSummary
    trades: LiveTrade[]
    period: LivePeriod | null
  }
  backtest: LiveBacktestSection | null
  diff: LiveDiff | null
  warnings: string[]
}
