"""ライブ実績 API レスポンス用 Pydantic モデル。

フィールド名は ``routers/live.py`` の各エンドポイントが実際に返す dict の
キーに合わせている。すべて ``extra="allow"`` で前方互換性を確保。
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class LiveListItem(BaseModel):
    """``GET /api/live`` リストの 1 件。

    ``kind`` は ``"strategy"``（trade 単位 / ``live_summaries``）または
    ``"position"``（combine portfolio / ``live_position_summaries``）。
    """

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    has_summary: bool
    has_trades: bool
    kind: Literal["strategy", "position"] | None = None


class LivePeriod(BaseModel):
    """``LiveDetail.live.period`` / ``LiveDetail.backtest.period``。"""

    model_config = ConfigDict(extra="allow")

    start: str
    end: str


class LiveTrade(BaseModel):
    """live trades JSON を正規化した 1 件。"""

    model_config = ConfigDict(extra="allow")

    trade_id: str = ""
    symbol: str = ""
    side: str
    entry_at: str
    exit_at: str
    qty: float = 0.0
    entry_price: float = 0.0
    exit_price: float = 0.0
    net_pnl: float = 0.0
    return_pct: float | None = None
    exit_reason: str | None = None


class LiveSection(BaseModel):
    """``LiveDetail.live`` セクション (summary / trades / period)。"""

    model_config = ConfigDict(extra="allow")

    summary: dict[str, Any]
    trades: list[LiveTrade] = []
    period: LivePeriod | None = None


class LiveAligned(BaseModel):
    """``LiveDetail.backtest.aligned``: 期間整合済みのバックテスト集計値。"""

    model_config = ConfigDict(extra="allow")

    total_trades: int
    win_rate_pct: float
    profit_factor: float
    max_drawdown_pct: float
    net_pnl: float


class LiveBacktest(BaseModel):
    """``LiveDetail.backtest``: 対応 backtest の run_id + period + aligned 集計。"""

    model_config = ConfigDict(extra="allow")

    run_id: str
    period: LivePeriod
    aligned: LiveAligned | None = None


class LiveDiff(BaseModel):
    """``LiveDetail.diff``: live − aligned のメトリクス差分。"""

    model_config = ConfigDict(extra="allow")

    total_trades: float | None = None
    win_rate_pct: float | None = None
    profit_factor: float | None = None
    max_drawdown_pct: float | None = None
    net_pnl: float | None = None


class LiveDetail(BaseModel):
    """``GET /api/live/{strategy_id}`` 詳細レスポンス。

    live summary + 正規化済み trades と、それに整合する backtest aligned/diff、
    計算できなかった理由を伝える warnings 配列を返す。
    """

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    live: LiveSection
    backtest: LiveBacktest | None = None
    diff: LiveDiff | None = None
    warnings: list[str] = []
