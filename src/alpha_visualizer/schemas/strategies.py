"""戦略 API レスポンス用 Pydantic モデル。

フィールド名は ``routers/strategies.py`` の各エンドポイントが実際に返す
dict のキーに合わせている。すべて ``extra="allow"`` で前方互換性を確保。
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ComparisonEquityCurve(BaseModel):
    """``StrategyComparison.equity`` の構造（dates / values の配列ペア）。"""

    model_config = ConfigDict(extra="allow")

    dates: list[str] = []
    values: list[float] = []


class StrategySummary(BaseModel):
    """``GET /api/strategies`` リストの 1 件。"""

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    name: str
    symbol: str | None = None
    timeframe: str | None = None
    tags: list[str] = []
    target_symbols: list[str] = []
    latest_sharpe: float | None = None
    latest_return_pct: float | None = None
    latest_max_drawdown_pct: float | None = None
    latest_profit_factor: float | None = None
    latest_win_rate_pct: float | None = None
    latest_total_trades: int | None = None
    last_run_at: str | None = None
    # 最新ランの実行元 provenance（"strategy" / "strategy-file" / null=不明）。
    # "strategy-file" は保存していないチューニング試行ラン（vis#299）
    latest_source: str | None = None


class StrategyComparison(BaseModel):
    """``GET /api/strategies/compare`` の 1 件。equity / 比較指標を含む。"""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    symbol: str = ""
    total_return_pct: float = 0.0
    cagr_pct: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown_pct: float = 0.0
    win_rate_pct: float = 0.0
    profit_factor: float = 0.0
    total_trades: int = 0
    is_baseline: bool = False
    equity: ComparisonEquityCurve = ComparisonEquityCurve()
    daily_returns: list[float] = []


class StrategyResultEntry(BaseModel):
    """``StrategyDetail.results`` の 1 件（バックテスト履歴サマリ）。"""

    model_config = ConfigDict(extra="allow")

    run_id: str
    symbol: str | None = None
    sharpe: float | None = None
    return_pct: float | None = None
    max_drawdown_pct: float | None = None
    total_trades: int | None = None
    run_at: str | None = None
    # 実行元 provenance（"strategy" / "strategy-file" / null=不明・vis#299）
    source: str | None = None


class OptimizationHistoryEntry(BaseModel):
    """``StrategyDetail.optimization_history`` の 1 件。"""

    model_config = ConfigDict(extra="allow")

    trial: int
    best_sharpe: float | None = None
    run_at: str | None = None
    n_trials: int | None = None


class StrategyDetail(BaseModel):
    """``GET /api/strategies/{strategy_id}`` 詳細レスポンス。

    戦略定義（parameters / indicators / variables / *_conditions /
    risk_management / regime_config）と、バックテスト履歴 / 最適化履歴を返す。
    """

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    name: str
    parameters: dict[str, Any] = {}
    indicators: list[Any] = []
    variables: list[Any] = []
    entry_conditions: Any = None
    exit_conditions: Any = None
    risk_management: Any = None
    regime_config: Any = None
    results: list[StrategyResultEntry] = []
    optimization_history: list[OptimizationHistoryEntry] = []
