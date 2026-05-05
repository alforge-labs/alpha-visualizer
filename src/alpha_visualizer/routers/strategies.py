"""戦略 API ルーター

`/api/strategies`、`/api/strategies/compare`、`/api/strategies/{strategy_id}` を提供する。
戦略定義の取得元は forge.yaml の ``strategies.use_db`` で切り替わる:
- ``true``: ``strategies.db`` の ``strategies`` テーブルから読む
- ``false`` または未設定: ``strategies_dir/*.json`` を glob する（後方互換）
"""
from __future__ import annotations

import json
import logging
import pathlib
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import create_engine, select

from alpha_visualizer.db import backtest_results, optimization_runs, strategies
from alpha_visualizer.forge_config import ForgeConfig

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_strategies_from_db(db_path: pathlib.Path) -> list[dict[str, Any]]:
    """``strategies.db`` から戦略定義を読み取る。"""
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    out: list[dict[str, Any]] = []
    with engine.connect() as conn:
        for row in conn.execute(select(strategies)):
            try:
                data = json.loads(row.definition_json)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(
                    "戦略定義 JSON のパースに失敗: %s (%s)", row.strategy_id, e
                )
                continue
            if not isinstance(data, dict):
                continue
            data.setdefault("strategy_id", row.strategy_id)
            data.setdefault("name", row.name)
            out.append(data)
    return out


def _load_strategies_from_json(strategies_dir: pathlib.Path) -> list[dict[str, Any]]:
    """``strategies_dir/*.json`` から戦略定義を読み取る（後方互換経路）。"""
    if not strategies_dir.exists():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(strategies_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("戦略ファイルの読み込みをスキップ: %s (%s)", p, e)
            continue
        if not isinstance(data, dict):
            continue
        data.setdefault("strategy_id", p.stem)
        data.setdefault("name", p.stem)
        out.append(data)
    return out


def _load_all_strategy_records(config: ForgeConfig) -> list[dict[str, Any]]:
    """forge.yaml の設定に従って戦略定義の一覧を返す。"""
    if config.strategies_db is not None and config.strategies_db.exists():
        return _load_strategies_from_db(config.strategies_db)
    return _load_strategies_from_json(config.strategies_dir)


def _load_strategy_record(
    config: ForgeConfig, strategy_id: str
) -> dict[str, Any] | None:
    """指定 strategy_id の戦略定義を取得する。"""
    for record in _load_all_strategy_records(config):
        if record.get("strategy_id") == strategy_id:
            return record
    return None


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
    result: list[dict[str, Any]] = []
    for record in _load_all_strategy_records(config):
        sid = record.get("strategy_id")
        if not isinstance(sid, str):
            continue
        entry: dict[str, Any] = {
            "strategy_id": sid,
            "name": record.get("name", sid),
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
        record = _load_strategy_record(config, sid)
        name = record.get("name", sid) if record else sid
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
    record = _load_strategy_record(config, strategy_id)
    if record is None:
        raise HTTPException(
            status_code=404, detail=f"strategy_id '{strategy_id}' が見つかりません"
        )
    return {
        "strategy_id": record.get("strategy_id", strategy_id),
        "name": record.get("name", strategy_id),
        "parameters": record.get("parameters", {}),
        "results": _get_all_results(config, strategy_id),
        "optimization_history": _get_optimization_history(config, strategy_id),
    }
