"""バックテスト結果 API レスポンス用 Pydantic モデル。

リストは ``services.backtest.summarize_row``、詳細は ``build_detail`` の
出力構造に合わせている。すべて ``extra="allow"`` で前方互換性を確保。
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class BacktestSummary(BaseModel):
    """``GET /api/results`` リストの 1 件。"""

    model_config = ConfigDict(extra="allow")

    run_id: str
    strategy_id: str | None = None
    symbol: str | None = None
    run_at: str | None = None
    sharpe_ratio: float | None = None
    total_return_pct: float | None = None
    max_drawdown_pct: float | None = None
    total_trades: int | None = None


class Period(BaseModel):
    """``BacktestDetail.period``: equity 期間の YYYY-MM 表記。"""

    model_config = ConfigDict(extra="allow")

    start: str = ""
    end: str = ""


class BacktestEquityCurve(BaseModel):
    """``BacktestDetail.equity``: dates / values の配列ペア。"""

    model_config = ConfigDict(extra="allow")

    dates: list[str] = []
    values: list[float] = []


class IsCutoff(BaseModel):
    """``BacktestDetail.is_cutoff``: IS / OOS の境界位置。"""

    model_config = ConfigDict(extra="allow")

    date: str | None = None
    index: int = -1


class Trade(BaseModel):
    """``BacktestDetail.trades`` の 1 件。"""

    model_config = ConfigDict(extra="allow")

    id: int | str
    direction: str
    entry_date: str = ""
    exit_date: str = ""
    entry_price: float = 0.0
    return_pct: float = 0.0
    pnl: float = 0.0
    holding_days: int = 0
    mae_pct: float = 0.0
    mfe_pct: float = 0.0


class BacktestDetail(BaseModel):
    """``GET /api/results/{run_id}`` 詳細レスポンス。

    フィールドは ``services.backtest.build_detail`` の出力構造に対応する。
    ``metrics`` / ``is_metrics`` / ``oos_metrics`` / ``monthly_returns``
    などの巨大ネストは ``Any`` で受け、``extra="allow"`` で将来追加にも追従。

    ``regime_series`` / ``regime_breakdown`` は条件付きで含まれる
    オプショナルなキーで、``extra="allow"`` 経由でパススルーする
    （None で固定キーにすると未指定のはずのレスポンスに ``"regime_*": null``
    が出てしまうため、明示フィールドにはしない）。
    """

    model_config = ConfigDict(extra="allow")

    run_id: str
    strategy_id: str
    strategy_name: str
    symbol: str = ""
    timeframe: str = "1d"
    run_at: str = ""
    period: Period = Period()
    equity: BacktestEquityCurve = BacktestEquityCurve()
    drawdown: list[float] = []
    daily_returns: list[float] = []
    buy_hold_equity: list[float] = []
    is_cutoff: IsCutoff = IsCutoff()
    metrics: dict[str, Any] = {}
    is_metrics: dict[str, Any] | None = None
    oos_metrics: dict[str, Any] | None = None
    monthly_returns: dict[int, list[float | None]] = {}
    trades: list[Trade] = []
    benchmark_annual_returns: dict[int, float] = {}
