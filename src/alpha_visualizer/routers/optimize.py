"""最適化結果 API ルーター

`/api/optimize/{strategy_id}` を提供する。
optimization_runs テーブルの all_trials_json を Repository 経由で取得し、
Grid Search / Optuna 形式のトライアル一覧（params / metric / pass）を返す。
"""
from __future__ import annotations

import json
import logging
import math
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from alpha_visualizer.dependencies import (
    get_forge_config_dep,
    get_optimization_repo,
)
from alpha_visualizer.errors import DataCorruptError, NotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.log_sanitize import sanitize_for_log
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.schemas.optimize import OptimizeResult

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


@router.get("/optimize/{strategy_id}", response_model=OptimizeResult)
async def get_optimize(
    strategy_id: str,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    repo: Annotated[OptimizationRepository, Depends(get_optimization_repo)],
) -> dict[str, Any]:
    if not config.forge_db.exists():
        raise NotFoundError("バックテスト DB が見つかりません")

    try:
        rows = repo.list_runs_for_strategy(strategy_id)
    except Exception as e:
        # CWE-117 対策: ユーザー入力 strategy_id は CR/LF を除去してからログに出す
        logger.warning(
            "最適化結果の取得に失敗: %s (%s)",
            sanitize_for_log(strategy_id),
            e,
        )
        raise DataCorruptError(
            f"最適化結果の取得に失敗しました: {strategy_id}",
        ) from e

    # 最新ランから走査し、純 WFT 行（`optimize walk-forward --save`・forge#1293。
    # 抽出可能な trial がなく window 形式 trial のみ）はスキップして直近の
    # 通常最適化ランを採用する。WFT 行を採用すると trial 散布図が空になり
    # best_metric が集約 OOS 値にすり替わるため（WFT 行は WFO タブが読む）。
    # 混在行（旧フォーマット）は通常 trial が抽出できるため従来どおり採用される。
    row = None
    trials: list[dict[str, Any]] = []
    metric_name = "sharpe_ratio"
    for candidate in rows:
        metric_name = str(candidate.best_metric_name or "sharpe_ratio")
        all_trials: list[dict[str, Any]] | None = None
        if candidate.all_trials_json:
            try:
                all_trials = json.loads(candidate.all_trials_json)
            except (json.JSONDecodeError, TypeError) as exc:
                # 破損 JSON や旧フォーマット混入時は trials なしで継続する
                logger.debug("all_trials_json のパースに失敗: %s", exc)
        trials = _extract_trials(all_trials, metric_name)
        if (
            not trials
            and all_trials
            and any(isinstance(t, dict) and _is_wfo_trial(t) for t in all_trials)
        ):
            continue
        row = candidate
        break

    if row is None:
        raise NotFoundError(f"最適化結果が見つかりません: {strategy_id}")

    best_metric: float | None = (
        row.best_metric_value
        if row.best_metric_value is not None and math.isfinite(row.best_metric_value)
        else None
    )

    return {
        "strategy_id": strategy_id,
        "run_at": str(row.run_at or ""),
        "metric_name": metric_name,
        "best_metric": best_metric,
        "trials": trials,
    }
