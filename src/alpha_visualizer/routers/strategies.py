"""戦略 API ルーター

`/api/strategies`、`/api/strategies/compare`、`/api/strategies/{strategy_id}` を提供する。
戦略 JSON は ForgeConfig.strategies_dir/*.json から直接読み取る。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import create_engine, select

from alpha_visualizer.db import backtest_results, optimization_runs
from alpha_visualizer.forge_config import ForgeConfig

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_latest_result(config: ForgeConfig, strategy_id: str) -> dict[str, Any] | None:
    db_path = config.forge_db
    if not db_path.exists():
        return None
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.connect() as conn:
        row = conn.execute(
            select(
                backtest_results.c.symbol,
                backtest_results.c.sharpe_ratio,
                backtest_results.c.total_return_pct,
                backtest_results.c.max_drawdown_pct,
                backtest_results.c.total_trades,
                backtest_results.c.cagr_pct,
                backtest_results.c.sortino_ratio,
                backtest_results.c.win_rate_pct,
                backtest_results.c.profit_factor,
                backtest_results.c.run_at,
            )
            .where(backtest_results.c.strategy_id == strategy_id)
            .order_by(backtest_results.c.run_at.desc())
            .limit(1)
        ).first()
    if row is None:
        return None
    return {
        "symbol": row.symbol,
        "sharpe_ratio": row.sharpe_ratio,
        "total_return_pct": row.total_return_pct,
        "max_drawdown_pct": row.max_drawdown_pct,
        "total_trades": row.total_trades,
        "cagr_pct": row.cagr_pct,
        "sortino_ratio": row.sortino_ratio,
        "win_rate_pct": row.win_rate_pct,
        "profit_factor": row.profit_factor,
        "run_at": row.run_at,
    }


def _get_all_results(config: ForgeConfig, strategy_id: str) -> list[dict[str, Any]]:
    db_path = config.forge_db
    if not db_path.exists():
        return []
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                backtest_results.c.symbol,
                backtest_results.c.sharpe_ratio,
                backtest_results.c.total_return_pct,
                backtest_results.c.max_drawdown_pct,
                backtest_results.c.total_trades,
                backtest_results.c.run_at,
            )
            .where(backtest_results.c.strategy_id == strategy_id)
            .order_by(backtest_results.c.run_at.desc())
        ).fetchall()
    return [
        {
            "symbol": r.symbol,
            "sharpe": r.sharpe_ratio,
            "return_pct": r.total_return_pct,
            "max_drawdown_pct": r.max_drawdown_pct,
            "total_trades": r.total_trades,
            "run_at": r.run_at,
        }
        for r in rows
    ]


def _get_optimization_history(config: ForgeConfig, strategy_id: str) -> list[dict[str, Any]]:
    db_path = config.forge_db
    if not db_path.exists():
        return []
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                optimization_runs.c.best_metric_value,
                optimization_runs.c.run_at,
                optimization_runs.c.n_trials,
            )
            .where(optimization_runs.c.strategy_id == strategy_id)
            .order_by(optimization_runs.c.run_at.desc())
        ).fetchall()
    history = []
    for i, row in enumerate(reversed(rows), start=1):
        history.append({
            "trial": i,
            "best_sharpe": row.best_metric_value,
            "run_at": row.run_at,
            "n_trials": row.n_trials,
        })
    return history


@router.get("/strategies")
async def list_strategies(request: Request) -> list[dict[str, Any]]:
    config: ForgeConfig = request.app.state.forge_config
    strategies_dir = config.strategies_dir
    if not strategies_dir.exists():
        return []
    result: list[dict[str, Any]] = []
    for p in sorted(strategies_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            sid = data.get("strategy_id", p.stem)
            entry: dict[str, Any] = {
                "strategy_id": sid,
                "name": data.get("name", p.stem),
                "latest_sharpe": None,
                "latest_return_pct": None,
                "latest_total_trades": None,
                "last_run_at": None,
            }
            latest = _get_latest_result(config, sid)
            if latest:
                entry["latest_sharpe"] = latest.get("sharpe_ratio")
                entry["latest_return_pct"] = latest.get("total_return_pct")
                entry["latest_total_trades"] = latest.get("total_trades")
                entry["last_run_at"] = latest.get("run_at")
            result.append(entry)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("戦略ファイルの読み込みをスキップ: %s (%s)", p, e)
            continue
    return result


@router.get("/strategies/compare")
async def compare_strategies(
    request: Request,
    ids: str = Query(..., description="カンマ区切りの strategy_id"),
) -> list[dict[str, Any]]:
    config: ForgeConfig = request.app.state.forge_config
    parsed = [s for s in (i.strip() for i in ids.split(",")) if s]
    if not parsed:
        raise HTTPException(status_code=400, detail="ids が空です")
    out: list[dict[str, Any]] = []
    for idx, sid in enumerate(parsed):
        latest = _get_latest_result(config, sid)
        if not latest:
            continue
        strategy_file = config.strategies_dir / f"{sid}.json"
        name = sid
        if strategy_file.exists():
            try:
                data = json.loads(strategy_file.read_text(encoding="utf-8"))
                name = data.get("name", sid)
            except (json.JSONDecodeError, OSError):
                pass
        out.append(
            {
                "id": sid,
                "name": name,
                "symbol": latest.get("symbol", ""),
                "total_return_pct": float(latest.get("total_return_pct") or 0.0),
                "cagr_pct": float(latest.get("cagr_pct") or 0.0),
                "sharpe_ratio": float(latest.get("sharpe_ratio") or 0.0),
                "sortino_ratio": float(latest.get("sortino_ratio") or 0.0),
                "max_drawdown_pct": float(latest.get("max_drawdown_pct") or 0.0),
                "win_rate_pct": float(latest.get("win_rate_pct") or 0.0),
                "profit_factor": float(latest.get("profit_factor") or 0.0),
                "total_trades": int(latest.get("total_trades") or 0),
                "is_baseline": idx == 0,
            }
        )
    if not out:
        raise HTTPException(
            status_code=404,
            detail=f"指定した戦略のバックテスト結果が見つかりません: {parsed}",
        )
    return out


@router.get("/strategies/{strategy_id}")
async def get_strategy(strategy_id: str, request: Request) -> dict[str, Any]:
    config: ForgeConfig = request.app.state.forge_config
    json_file = config.strategies_dir / f"{strategy_id}.json"
    if not json_file.exists():
        raise HTTPException(status_code=404, detail=f"strategy_id '{strategy_id}' が見つかりません")
    try:
        data = json.loads(json_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"戦略ファイルの読み込みに失敗: {e}") from e
    return {
        "strategy_id": data.get("strategy_id", strategy_id),
        "name": data.get("name", strategy_id),
        "parameters": data.get("parameters", {}),
        "results": _get_all_results(config, strategy_id),
        "optimization_history": _get_optimization_history(config, strategy_id),
    }
