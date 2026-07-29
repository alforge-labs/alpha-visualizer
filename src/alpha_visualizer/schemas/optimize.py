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


class OptimizeRunSummary(BaseModel):
    """optimize run 切替 UI 用のメタ情報 1 件（issue #348）。"""

    run_id: str
    run_at: str = ""
    n_trials: int | None = None
    best_metric_name: str = "sharpe_ratio"
    best_metric_value: float | None = None


class OptimizeResult(BaseModel):
    """``GET /api/optimize/{strategy_id}`` レスポンス。"""

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    run_id: str = ""
    run_at: str = ""
    metric_name: str = "sharpe_ratio"
    best_metric: float | None = None
    # DB の n_trials カラム由来の総試行数。all_trials_json（トライアル明細）が
    # 未保存の run では trials が空でもこの値は入る（issue #348）。
    n_trials: int | None = None
    trials: list[OptimizeTrial] = []
    # 同一戦略の optimize run 一覧（新しい順）。切替 UI 用
    runs: list[OptimizeRunSummary] = []
