"""ウォークフォーワード結果 API ルーター

`/api/wfo/{strategy_id}` を提供する。
optimization_runs テーブルの all_trials_json を直接クエリしてウィンドウ別 IS/OOS を返す。
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


def _extract_windows(all_trials: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not all_trials:
        return []
    windows: list[dict[str, Any]] = []
    for i, trial in enumerate(all_trials):
        if not isinstance(trial, dict):
            continue
        if "window_id" not in trial and "is_sharpe" not in trial:
            continue
        is_sharpe = float(trial.get("is_sharpe") or 0.0)
        oos_sharpe = float(trial.get("oos_sharpe") or 0.0)
        is_return = float(trial.get("is_return_pct") or trial.get("is_return") or 0.0)
        oos_return = float(trial.get("oos_return_pct") or trial.get("oos_return") or 0.0)
        ratio = oos_sharpe / is_sharpe if is_sharpe else 0.0
        passed = bool(trial.get("pass", oos_sharpe > 0))
        params_raw = trial.get("params") or trial.get("best_params") or {}
        params: dict[str, float] = {}
        for k, v in params_raw.items():
            try:
                params[str(k)] = float(v)
            except (TypeError, ValueError):
                continue
        windows.append(
            {
                "id": int(trial.get("window_id") or i + 1),
                "label": str(trial.get("label") or f"W{i + 1}"),
                "is_start": str(trial.get("is_start") or ""),
                "is_end": str(trial.get("is_end") or ""),
                "oos_start": str(trial.get("oos_start") or ""),
                "oos_end": str(trial.get("oos_end") or ""),
                "is_sharpe": is_sharpe,
                "oos_sharpe": oos_sharpe,
                "is_return": is_return,
                "oos_return": oos_return,
                "oos_is_ratio": ratio,
                "params": params,
                "pass": passed,
            }
        )
    return windows


def _resolve_strategy_name(config: ForgeConfig, strategy_id: str) -> str:
    path = config.strategies_dir / f"{strategy_id}.json"
    if not path.exists():
        return strategy_id
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return str(data.get("name", strategy_id))
    except (OSError, ValueError):
        return strategy_id


@router.get("/wfo/{strategy_id}")
async def get_wfo(strategy_id: str, request: Request) -> dict[str, Any]:
    config: ForgeConfig = request.app.state.forge_config
    db_path = config.forge_db
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="バックテスト DB が見つかりません")
    try:
        engine = create_engine(f"sqlite:///{db_path}", future=True)
        with engine.connect() as conn:
            rows = conn.execute(
                select(
                    optimization_runs.c.symbol,
                    optimization_runs.c.all_trials_json,
                )
                .where(optimization_runs.c.strategy_id == strategy_id)
                .order_by(optimization_runs.c.run_at.desc())
            ).fetchall()
    except Exception as e:
        logger.warning("WFO 取得に失敗: %s (%s)", strategy_id, e)
        raise HTTPException(
            status_code=404, detail=f"WFO 結果の取得に失敗しました: {strategy_id}"
        ) from e

    windows: list[dict[str, Any]] = []
    symbol = ""
    for row in rows:
        if not symbol:
            symbol = str(row.symbol or "")
        all_trials: list[dict[str, Any]] | None = None
        if row.all_trials_json:
            try:
                all_trials = json.loads(row.all_trials_json)
            except (json.JSONDecodeError, TypeError):
                pass
        windows = _extract_windows(all_trials)
        if windows:
            break

    if not windows:
        raise HTTPException(
            status_code=404,
            detail=f"WFO 形式の最適化結果が見つかりません: {strategy_id}",
        )
    return {
        "strategy_id": strategy_id,
        "strategy_name": _resolve_strategy_name(config, strategy_id),
        "symbol": symbol,
        "windows": windows,
        "composite_equity": [],
        "composite_dates": [],
    }
