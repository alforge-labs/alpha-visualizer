"""バックテスト結果 API レスポンス用 Pydantic モデル。

フィールドは ``services.backtest.summarize_row`` が返す 8 フィールドに合わせる。
"""
from __future__ import annotations

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
