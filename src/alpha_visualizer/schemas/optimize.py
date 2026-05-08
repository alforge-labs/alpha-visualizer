"""最適化 API レスポンス用 Pydantic モデル。

フィールド名は ``routers/optimize.py::get_optimize`` が返す dict 構造に合わせている。
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class OptimizeTrial(BaseModel):
    """1 試行のパラメータと評価値。

    ``routers/optimize.py::_parse_trial`` が組み立てる dict の構造：
    ``{"params": {...}, "metric": float, "pass": bool, "metrics": {...}}``。

    ``pass`` キーは Python 予約語のため明示フィールドとして宣言できない。
    レスポンス互換性のため ``extra="allow"`` で透過的に保持する。
    """

    model_config = ConfigDict(extra="allow")

    params: dict[str, float] = {}
    metric: float = 0.0
    metrics: dict[str, float] = {}


class OptimizeResult(BaseModel):
    """``GET /api/optimize/{strategy_id}`` レスポンス。"""

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    run_at: str = ""
    metric_name: str = "sharpe_ratio"
    best_metric: float | None = None
    trials: list[OptimizeTrial] = []
