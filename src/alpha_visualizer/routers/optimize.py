"""最適化結果 API ルーター

`/api/optimize/{strategy_id}` を提供する。
optimization_runs テーブルの all_trials_json を直接クエリし、
Grid Search / Optuna 形式のトライアル一覧（params / metric / pass）を返す。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import create_engine, select

from alpha_visualizer.db import optimization_runs
from alpha_visualizer.forge_config import ForgeConfig

logger = logging.getLogger(__name__)

router = APIRouter()

_METRIC_KEYS: frozenset[str] = frozenset(
    {
        "sharpe_ratio",
        "sortino_ratio",
        "calmar_ratio",
        "max_drawdown_pct",
        "total_return_pct",
        "cagr_pct",
        "win_rate_pct",
        "profit_factor",
        "total_trades",
        "avg_holding_days",
        "omega_ratio",
        "var_95_pct",
        "cvar_95_pct",
    }
)

_WFO_KEYS: frozenset[str] = frozenset(
    {"window_id", "is_sharpe", "oos_sharpe", "is_start", "oos_start"}
)


def _is_wfo_trial(trial: dict[str, Any]) -> bool:
    return bool(_WFO_KEYS & trial.keys())


def _parse_trial(
    trial: dict[str, Any],
    metric_name: str,
) -> dict[str, Any] | None:
    if _is_wfo_trial(trial):
        return None

    params: dict[str, float] = {}
    metrics: dict[str, float] = {}
    for k, v in trial.items():
        try:
            fv = float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if k in _METRIC_KEYS:
            metrics[k] = fv
        else:
            params[k] = fv

    if not params:
        return None

    raw_metric = metrics.get(metric_name, 0.0)
    return {
        "params": params,
        "metric": raw_metric,
        "pass": raw_metric > 0,
        "metrics": metrics,
    }


def _extract_trials(
    all_trials: list[dict[str, Any]] | None,
    metric_name: str,
) -> list[dict[str, Any]]:
    if not all_trials:
        return []
    result: list[dict[str, Any]] = []
    for trial in all_trials:
        if not isinstance(trial, dict):
            continue
        parsed = _parse_trial(trial, metric_name)
        if parsed is not None:
            result.append(parsed)
    return result


@router.get("/optimize/{strategy_id}")
async def get_optimize(strategy_id: str, request: Request) -> dict[str, Any]:
    config: ForgeConfig = request.app.state.forge_config
    db_path = config.forge_db
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="バックテスト DB が見つかりません")

    try:
        engine = create_engine(f"sqlite:///{db_path}", future=True)
        with engine.connect() as conn:
            row = conn.execute(
                select(
                    optimization_runs.c.run_at,
                    optimization_runs.c.best_metric_name,
                    optimization_runs.c.best_metric_value,
                    optimization_runs.c.all_trials_json,
                )
                .where(optimization_runs.c.strategy_id == strategy_id)
                .order_by(optimization_runs.c.run_at.desc())
                .limit(1)
            ).fetchone()
    except Exception as e:
        logger.warning("最適化結果の取得に失敗: %s (%s)", strategy_id, e)
        raise HTTPException(
            status_code=404,
            detail=f"最適化結果の取得に失敗しました: {strategy_id}",
        ) from e

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"最適化結果が見つかりません: {strategy_id}",
        )

    metric_name = str(row.best_metric_name or "sharpe_ratio")
    best_metric = float(row.best_metric_value or 0.0)

    all_trials: list[dict[str, Any]] | None = None
    if row.all_trials_json:
        try:
            all_trials = json.loads(row.all_trials_json)
        except (json.JSONDecodeError, TypeError):
            pass

    trials = _extract_trials(all_trials, metric_name)

    return {
        "strategy_id": strategy_id,
        "run_at": str(row.run_at or ""),
        "metric_name": metric_name,
        "best_metric": best_metric,
        "trials": trials,
    }
