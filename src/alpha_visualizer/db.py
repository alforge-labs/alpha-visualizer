"""forge.db / strategies.db の SQLAlchemy テーブル定義（読み取り専用）"""

from sqlalchemy import REAL, Column, Integer, MetaData, Table, Text

metadata = MetaData()

strategies = Table(
    "strategies",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("strategy_id", Text, nullable=False, unique=True),
    Column("name", Text, nullable=False),
    Column("version", Text),
    Column("asset_type", Text),
    Column("timeframe", Text),
    Column("tags", Text),
    Column("notes", Text),
    Column("definition_json", Text, nullable=False),
    Column("source_file", Text),
    Column("created_at", Text),
    Column("updated_at", Text),
)

backtest_results = Table(
    "backtest_results",
    metadata,
    Column("run_id", Text, primary_key=True),
    Column("strategy_id", Text),
    Column("symbol", Text),
    Column("run_at", Text),
    Column("total_return_pct", REAL),
    Column("cagr_pct", REAL),
    Column("sharpe_ratio", REAL),
    Column("sortino_ratio", REAL),
    Column("calmar_ratio", REAL),
    Column("max_drawdown_pct", REAL),
    Column("total_trades", Integer),
    Column("win_rate_pct", REAL),
    Column("profit_factor", REAL),
    Column("avg_holding_days", REAL),
    Column("metrics_json", Text),
    Column("equity_curve_json", Text),
    Column("buy_hold_curve_json", Text),
    Column("trades_json", Text),
    Column("oos_start", Text),
)

optimization_runs = Table(
    "optimization_runs",
    metadata,
    Column("run_id", Text, primary_key=True),
    Column("strategy_id", Text),
    Column("symbol", Text),
    Column("run_at", Text),
    Column("n_trials", Integer),
    Column("best_metric_name", Text),
    Column("best_metric_value", REAL),
    Column("best_params_json", Text),
    Column("duration_seconds", REAL),
    Column("all_trials_json", Text),
)
