"""戦略 API レスポンス用 Pydantic モデル。

フィールド名は ``routers/strategies.py::_strategy_to_summary`` および
``compare_strategies`` が実際に返す dict のキーに合わせている。
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class EquityCurve(BaseModel):
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
    equity: EquityCurve = EquityCurve()
    daily_returns: list[float] = []
