"""backtest_results.db / strategies.db の SQLAlchemy テーブル定義（読み取り専用）"""

from os import PathLike
from pathlib import Path

from sqlalchemy import REAL, Column, Engine, Integer, MetaData, Table, Text, create_engine

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
    # 実行元 provenance（forge ysakae/alpha-forge#1295）: "strategy"（登録戦略）/
    # "strategy-file"（一時定義 = チューニング試行等）。旧 forge の DB には
    # 列自体が無いため、Repository 側で有無を検出して SELECT から除外する
    Column("source", Text),
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

# ライブ実績テーブル群（alpha-forge `live/db_repository.py` の読み取りミラー）。
# alpha-forge は live trades/summaries を JSON ファイルではなく backtest_results.db
# の以下テーブルへ永続化する方式へ移行済み（issue #209）。本ツールは読み取り専用。
live_summaries = Table(
    "live_summaries",
    metadata,
    Column("strategy_id", Text, primary_key=True),
    Column("strategy_version", Text),
    Column("snapshot_id", Text),
    Column("broker", Text),
    Column("total_trades", Integer, nullable=False),
    Column("win_rate_pct", REAL, nullable=False),
    Column("gross_pnl", REAL, nullable=False),
    Column("net_pnl", REAL, nullable=False),
    Column("profit_factor", REAL, nullable=False),
    Column("avg_win", REAL, nullable=False),
    Column("avg_loss", REAL, nullable=False),
    Column("avg_slippage_bps", REAL, nullable=False),
    Column("total_commission", REAL, nullable=False),
    Column("max_drawdown_pct", REAL, nullable=False),
    Column("symbols", Text, nullable=False, default="[]"),
    Column("updated_at", Text, nullable=False),
)

live_trades = Table(
    "live_trades",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("trade_id", Text, nullable=False),
    Column("strategy_id", Text, nullable=False),
    Column("strategy_version", Text),
    Column("snapshot_id", Text),
    Column("broker", Text, nullable=False),
    Column("symbol", Text, nullable=False),
    Column("asset_class", Text),
    Column("timeframe", Text),
    Column("entry_at", Text, nullable=False),
    Column("exit_at", Text, nullable=False),
    Column("side", Text, nullable=False),
    Column("qty", REAL, nullable=False),
    Column("entry_price", REAL, nullable=False),
    Column("exit_price", REAL, nullable=False),
    Column("gross_pnl", REAL, nullable=False),
    Column("net_pnl", REAL, nullable=False),
    Column("commission", REAL, nullable=False),
    Column("slippage_bps", REAL),
    Column("return_pct", REAL),
    Column("holding_seconds", Integer),
    Column("exit_reason", Text),
    Column("tags", Text, nullable=False, default="[]"),
)

# combine portfolio（always-in-market overlay、trade_closed を出さない）の
# position ベース live サマリ。trade 単位の live_summaries とは別エンティティで
# portfolio_id 粒度・equity curve 由来の metrics を持つ（alpha-forge PR #995）。
live_position_summaries = Table(
    "live_position_summaries",
    metadata,
    Column("portfolio_id", Text, primary_key=True),
    Column("metrics_json", Text, nullable=False),
    Column("backtest_metrics_json", Text),
    Column("equity_json", Text, nullable=False, default="[]"),
    Column("receipts_count", Integer, nullable=False, default=0),
    Column("sub_strategies_json", Text, nullable=False, default="[]"),
    Column("updated_at", Text, nullable=False),
)


def get_engine(db_path: Path | str | PathLike[str]) -> Engine:
    """backtest_results.db / strategies.db への SQLAlchemy Engine を生成する。

    Engine はアプリケーション起動時に 1 度だけ生成し、`app.state.engine`
    に格納して使い回すことを想定している。各リクエストで再生成しない。
    """
    return create_engine(f"sqlite:///{Path(db_path).resolve()}")
