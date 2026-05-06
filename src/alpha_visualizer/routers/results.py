"""バックテスト結果 API ルーター

`/api/results` (一覧) と `/api/results/{run_id}` (詳細) を提供する。
詳細レスポンスはフロントエンド（visualizer/）の BacktestDetail 型と一致するよう整形済み。
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import create_engine, select

from alpha_visualizer.db import backtest_results
from alpha_visualizer.forge_config import ForgeConfig

logger = logging.getLogger(__name__)

router = APIRouter()

_MONTHS = list(range(1, 13))


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)


def _shape_monthly_returns(raw: dict[str, float] | None) -> dict[int, list[float | None]]:
    if not raw:
        return {}
    by_year: dict[int, list[float | None]] = {}
    for ym, pct in raw.items():
        try:
            year_str, month_str = ym.split("-", 1)
            year = int(year_str)
            month = int(month_str)
        except (ValueError, AttributeError):
            continue
        if month < 1 or month > 12:
            continue
        bucket = by_year.setdefault(year, [None] * 12)
        bucket[month - 1] = float(pct) if pct is not None else None
    return by_year


def _shape_annual_returns(raw: dict[str, float] | None) -> dict[int, float]:
    if not raw:
        return {}
    result: dict[int, float] = {}
    for year_str, pct in raw.items():
        try:
            result[int(year_str)] = float(pct)
        except (ValueError, TypeError):
            continue
    return result


def _shape_trades(
    raw_trades: list[dict[str, Any]] | None,
    trade_analysis: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not raw_trades:
        return []
    mae_list: list[float] = list(trade_analysis.get("per_trade_mae_pct", [])) if trade_analysis else []
    mfe_list: list[float] = list(trade_analysis.get("per_trade_mfe_pct", [])) if trade_analysis else []
    out: list[dict[str, Any]] = []
    for i, t in enumerate(raw_trades):
        direction = t.get("direction") or t.get("signal") or "long"
        return_pct = float(t.get("return_pct") or 0.0)
        pnl = float(t.get("pnl") or 0.0)
        out.append(
            {
                "id": t.get("id", i),
                "direction": "long" if str(direction).lower().startswith("long") else "short",
                "entry_date": t.get("entry_date") or "",
                "exit_date": t.get("exit_date") or "",
                "entry_price": float(t.get("entry_price") or 0.0),
                "return_pct": return_pct,
                "pnl": pnl,
                "holding_days": int(t.get("holding_days") or 0),
                "mae_pct": float(mae_list[i]) if i < len(mae_list) else float(t.get("mae_pct") or 0.0),
                "mfe_pct": float(mfe_list[i]) if i < len(mfe_list) else float(t.get("mfe_pct") or 0.0),
            }
        )
    return out


def _compute_drawdown(values: list[float]) -> list[float]:
    if not values:
        return []
    out: list[float] = []
    peak = values[0]
    for v in values:
        if v > peak:
            peak = v
        out.append(0.0 if peak == 0 else (v - peak) / peak * 100.0)
    return out


def _compute_daily_returns(values: list[float]) -> list[float]:
    if len(values) < 2:
        return []
    results: list[float] = []
    for i in range(1, len(values)):
        prev = values[i - 1]
        curr = values[i]
        if prev == 0.0 or not math.isfinite(prev) or not math.isfinite(curr):
            results.append(0.0)
        else:
            results.append(round((curr - prev) / prev * 100.0, 6))
    return results


def _compute_buy_hold_equity(record: dict[str, Any]) -> list[float]:
    raw = record.get("buy_hold_curve")
    if not raw or not isinstance(raw, list):
        return []
    try:
        if isinstance(raw[0], dict):
            vals = [float(item.get("value", 0.0)) for item in raw]
        else:
            vals = [float(v) for v in raw]
    except (TypeError, ValueError):
        return []
    if not vals or vals[0] == 0.0 or not math.isfinite(vals[0]):
        return []
    base = vals[0]
    return [round(v / base * 100.0, 4) if math.isfinite(v) else 0.0 for v in vals]


def _compute_benchmark_annual_returns(
    dates: list[str],
    buy_hold_values: list[float],
) -> dict[int, float]:
    """equity_curve 由来の日付と正規化済み buy_hold_equity から年次リターン % を計算する。
    年がギャップを含む場合、前の観測年末を当年の起点として扱う。
    """
    if not dates or not buy_hold_values:
        return {}
    if len(dates) != len(buy_hold_values):
        logger.warning(
            "dates length (%d) != buy_hold_values length (%d); "
            "skipping benchmark_annual_returns",
            len(dates),
            len(buy_hold_values),
        )
        return {}
    by_year: dict[int, list[tuple[str, float]]] = {}
    for d, v in zip(dates, buy_hold_values, strict=True):
        if not d or not math.isfinite(v):
            continue
        try:
            year = int(d[:4])
        except (ValueError, IndexError):
            continue
        by_year.setdefault(year, []).append((d, v))
    if not by_year:
        return {}
    sorted_years = sorted(by_year.keys())
    result: dict[int, float] = {}
    for i, year in enumerate(sorted_years):
        entries = sorted(by_year[year])
        year_end = entries[-1][1]
        if i == 0:
            year_start = entries[0][1]
        else:
            prev_entries = sorted(by_year[sorted_years[i - 1]])
            year_start = prev_entries[-1][1]
        if year_start != 0.0 and math.isfinite(year_start):
            result[year] = round((year_end - year_start) / year_start * 100.0, 4)
    return result


def _shape_equity(raw: list[Any] | None) -> tuple[list[str], list[float]]:
    if not raw:
        return [], []
    dates: list[str] = []
    values: list[float] = []
    for item in raw:
        if isinstance(item, dict):
            dates.append(str(item.get("date", "")))
            values.append(float(item.get("value", 0.0)))
        else:
            try:
                values.append(float(item))
                dates.append("")
            except (TypeError, ValueError):
                continue
    return dates, values


def _is_cutoff(dates: list[str], oos_start: str | None) -> dict[str, Any]:
    if not oos_start or not dates:
        return {"date": None, "index": -1}
    target = oos_start[:10] if len(oos_start) >= 10 else oos_start
    for i, d in enumerate(dates):
        if d >= target:
            prev = dates[i - 1] if i > 0 else None
            return {"date": prev, "index": i}
    return {"date": dates[-1] if dates else None, "index": len(dates)}


def _split_metrics(
    metrics: dict[str, Any], cutoff_idx: int, total: int
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if cutoff_idx <= 0 or cutoff_idx >= total or not metrics:
        return None, None
    is_ratio = cutoff_idx / total
    oos_ratio = 1.0 - is_ratio
    period_independent = {"sharpe_ratio", "sortino_ratio", "calmar_ratio", "win_rate_pct", "profit_factor"}
    is_m: dict[str, Any] = {}
    oos_m: dict[str, Any] = {}
    for key in (
        "total_return_pct", "cagr_pct", "sharpe_ratio", "sortino_ratio", "calmar_ratio",
        "max_drawdown_pct", "win_rate_pct", "profit_factor", "total_trades",
    ):
        v = metrics.get(key)
        if v is None:
            continue
        if key in period_independent:
            is_m[key] = float(v)
            oos_m[key] = float(v)
        elif key == "total_trades":
            is_m[key] = int(round(float(v) * is_ratio))
            oos_m[key] = max(int(v) - is_m[key], 0)
        else:
            is_m[key] = float(v) * is_ratio
            oos_m[key] = float(v) * oos_ratio
    return is_m or None, oos_m or None


def _row_to_dict(row: Any) -> dict[str, Any]:
    """SQLAlchemy Row をフラットな dict に変換する。metrics_json 等を展開する。"""
    metrics: dict[str, Any] = {}
    if row.metrics_json:
        try:
            metrics = json.loads(row.metrics_json)
        except (json.JSONDecodeError, TypeError):
            pass

    equity_curve: list[Any] = []
    if row.equity_curve_json:
        try:
            equity_curve = json.loads(row.equity_curve_json)
        except (json.JSONDecodeError, TypeError):
            pass

    buy_hold_curve: list[Any] = []
    if row.buy_hold_curve_json:
        try:
            buy_hold_curve = json.loads(row.buy_hold_curve_json)
        except (json.JSONDecodeError, TypeError):
            pass

    trades: list[Any] = []
    if row.trades_json:
        try:
            trades = json.loads(row.trades_json)
        except (json.JSONDecodeError, TypeError):
            pass

    # DB のトップレベルカラムを metrics にマージ（元 forge との互換性のため）
    for col in ("sharpe_ratio", "total_return_pct", "cagr_pct", "sortino_ratio",
                "calmar_ratio", "max_drawdown_pct", "total_trades", "win_rate_pct",
                "profit_factor", "avg_holding_days"):
        val = getattr(row, col, None)
        if val is not None and col not in metrics:
            metrics[col] = val

    return {
        "run_id": row.run_id,
        "strategy_id": row.strategy_id,
        "symbol": row.symbol,
        "run_at": row.run_at,
        "sharpe_ratio": row.sharpe_ratio,
        "total_return_pct": row.total_return_pct,
        "cagr_pct": row.cagr_pct,
        "max_drawdown_pct": row.max_drawdown_pct,
        "total_trades": row.total_trades,
        "oos_start": row.oos_start,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "buy_hold_curve": buy_hold_curve,
        "trades": trades,
    }


def _shape_detail(record: dict[str, Any]) -> dict[str, Any]:
    metrics: dict[str, Any] = dict(record.get("metrics") or {})
    metrics["annual_returns"] = _shape_annual_returns(metrics.get("annual_returns"))
    raw_equity = record.get("equity_curve")
    dates, values = _shape_equity(raw_equity)
    drawdown = _compute_drawdown(values)
    cutoff = _is_cutoff(dates, record.get("oos_start"))
    monthly = _shape_monthly_returns(metrics.get("monthly_returns"))
    trade_analysis = metrics.get("trade_analysis") or {}
    trades = _shape_trades(record.get("trades"), trade_analysis)
    is_m, oos_m = _split_metrics(metrics, cutoff["index"], len(values))
    period_start = dates[0][:7] if dates else ""
    period_end = dates[-1][:7] if dates else ""
    buy_hold_vals = _compute_buy_hold_equity(record)
    benchmark_annual = (
        _compute_benchmark_annual_returns(dates, buy_hold_vals) if buy_hold_vals else {}
    )

    return {
        "run_id": record.get("run_id", ""),
        "strategy_id": record.get("strategy_id", ""),
        "strategy_name": record.get("strategy_id", ""),
        "symbol": record.get("symbol", ""),
        "timeframe": record.get("timeframe", "1d"),
        "run_at": record.get("run_at", ""),
        "period": {"start": period_start, "end": period_end},
        "equity": {"dates": dates, "values": values},
        "drawdown": drawdown,
        "daily_returns": _compute_daily_returns(values),
        "buy_hold_equity": buy_hold_vals,
        "is_cutoff": cutoff,
        "metrics": metrics,
        "is_metrics": is_m,
        "oos_metrics": oos_m,
        "monthly_returns": monthly,
        "trades": trades,
        "benchmark_annual_returns": benchmark_annual,
    }


def _list_results_from_db(
    config: ForgeConfig,
    strategy_id: str | None,
    since: datetime | None,
) -> list[dict[str, Any]]:
    db_path = config.forge_db
    if not db_path.exists():
        return []
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    stmt = select(
        backtest_results.c.run_id,
        backtest_results.c.strategy_id,
        backtest_results.c.symbol,
        backtest_results.c.run_at,
        backtest_results.c.sharpe_ratio,
        backtest_results.c.total_return_pct,
        backtest_results.c.max_drawdown_pct,
        backtest_results.c.total_trades,
    ).order_by(backtest_results.c.run_at.desc())
    if strategy_id:
        stmt = stmt.where(backtest_results.c.strategy_id == strategy_id)
    rows: list[dict[str, Any]] = []
    with engine.connect() as conn:
        for r in conn.execute(stmt):
            if since is not None:
                try:
                    if _parse_dt(r.run_at or "") < since:
                        continue
                except ValueError:
                    pass
            rows.append({
                "run_id": r.run_id,
                "strategy_id": r.strategy_id,
                "symbol": r.symbol,
                "run_at": r.run_at,
                "sharpe_ratio": r.sharpe_ratio,
                "total_return_pct": r.total_return_pct,
                "max_drawdown_pct": r.max_drawdown_pct,
                "total_trades": r.total_trades,
            })
    return rows


def _get_result_from_db(config: ForgeConfig, run_id: str) -> dict[str, Any] | None:
    db_path = config.forge_db
    if not db_path.exists():
        return None
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.connect() as conn:
        row = conn.execute(
            backtest_results.select().where(backtest_results.c.run_id == run_id)
        ).first()
    if row is None:
        return None
    return _row_to_dict(row)


@router.get("/results")
async def list_results(
    request: Request,
    strategy_id: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    config: ForgeConfig = request.app.state.forge_config
    since_dt: datetime | None = None
    if since:
        try:
            since_dt = _parse_dt(since)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"since の形式が不正です: {since}") from e
    return _list_results_from_db(config, strategy_id, since_dt)


@router.get("/results/{run_id}")
async def get_result(run_id: str, request: Request) -> dict[str, Any]:
    config: ForgeConfig = request.app.state.forge_config
    record = _get_result_from_db(config, run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' が見つかりません")
    return _shape_detail(record)


__all__ = ["router", "_shape_detail"]
