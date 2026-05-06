"""ウォークフォーワード結果 API ルーター

`/api/wfo/{strategy_id}` を提供する。
optimization_runs テーブルの all_trials_json を直接クエリしてウィンドウ別 IS/OOS を返す。
composite_equity / composite_dates は backtest_results の OOS スライスを優先し、
欠損時は oos_return_pct から線形補間でフォールバックする。
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import Connection, create_engine, select

from alpha_visualizer.db import backtest_results, optimization_runs
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


def _parse_equity_curve(raw_json: str | None) -> list[tuple[str, float]]:
    """equity_curve_json を (date_str, value) タプルのリストにパースする。"""
    if not raw_json:
        return []
    try:
        points = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return []
    result: list[tuple[str, float]] = []
    for p in points:
        if not isinstance(p, dict):
            continue
        d = p.get("date")
        v = p.get("value")
        if isinstance(d, str) and d and isinstance(v, (int, float)) and v == v:
            result.append((d, float(v)))
    return result


def _normalize_to_anchor(values: list[float], anchor: float) -> list[float]:
    """values の先頭が anchor になるよう比例スケールして返す。"""
    if not values:
        return []
    first = values[0]
    if first == 0.0:
        return [anchor] * len(values)
    scale = anchor / first
    return [v * scale for v in values]


def _slice_oos_segment(
    points: list[tuple[str, float]],
    oos_start: str,
    oos_end: str,
) -> list[tuple[str, float]]:
    """OOS 期間（oos_start <= date <= oos_end）のポイントを抽出する。"""
    result = [p for p in points if p[0] >= oos_start]
    if oos_end:
        result = [p for p in result if p[0] <= oos_end]
    return result


def _interpolate_window_curve(
    oos_start: str,
    oos_end: str,
    oos_return_pct: float,
    anchor: float,
) -> tuple[list[str], list[float]]:
    """OOS リターン % から日次線形補間カーブを生成する（フォールバック）。"""
    if not oos_start or not oos_end:
        return [], []
    try:
        start_dt = date.fromisoformat(oos_start)
        end_dt = date.fromisoformat(oos_end)
    except ValueError:
        return [], []
    days = (end_dt - start_dt).days + 1
    if days <= 0:
        return [], []
    end_val = anchor * (1.0 + oos_return_pct / 100.0)
    dates: list[str] = []
    values: list[float] = []
    for i in range(days):
        d = start_dt + timedelta(days=i)
        t = i / (days - 1) if days > 1 else 1.0
        dates.append(d.isoformat())
        values.append(anchor + (end_val - anchor) * t)
    return dates, values


def _extract_composite_curve(
    windows: list[dict[str, Any]],
    strategy_id: str,
    conn: Connection,
) -> tuple[list[float], list[str]]:
    """各 OOS ウィンドウのエクイティを連結した合成カーブを返す。

    backtest_results の equity_curve_json を優先し、欠損時は oos_return から線形補間。
    """
    valid_windows = sorted(
        [w for w in windows if w.get("oos_start")],
        key=lambda w: w["oos_start"],
    )
    if not valid_windows:
        return [], []

    composite_equity: list[float] = []
    composite_dates: list[str] = []
    anchor = 100.0

    for window in valid_windows:
        oos_start = window["oos_start"]
        oos_end = window.get("oos_end") or ""

        seg_dates: list[str] = []
        seg_values: list[float] = []

        try:
            row = conn.execute(
                select(backtest_results.c.equity_curve_json)
                .where(backtest_results.c.strategy_id == strategy_id)
                .where(backtest_results.c.oos_start == oos_start)
                .order_by(backtest_results.c.run_at.desc())
                .limit(1)
            ).fetchone()
        except Exception:
            row = None

        if row and row.equity_curve_json:
            points = _parse_equity_curve(row.equity_curve_json)
            sliced = _slice_oos_segment(points, oos_start, oos_end)
            if sliced:
                raw_values = [v for _, v in sliced]
                seg_dates = [d for d, _ in sliced]
                seg_values = _normalize_to_anchor(raw_values, anchor)

        if not seg_dates:
            oos_return = float(window.get("oos_return") or 0.0)
            seg_dates, seg_values = _interpolate_window_curve(
                oos_start, oos_end, oos_return, anchor
            )

        if not seg_dates:
            continue

        if composite_dates and seg_dates[0] == composite_dates[-1]:
            # 先頭が前ウィンドウ末尾と同日の場合のみ重複を除去
            composite_equity.extend(seg_values[1:])
            composite_dates.extend(seg_dates[1:])
        else:
            composite_equity.extend(seg_values)
            composite_dates.extend(seg_dates)

        anchor = composite_equity[-1]

    return composite_equity, composite_dates


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

            try:
                composite_equity, composite_dates = _extract_composite_curve(
                    windows, strategy_id, conn
                )
            except Exception as e:
                logger.warning("composite curve 生成に失敗: %s (%s)", strategy_id, e)
                composite_equity, composite_dates = [], []

    except HTTPException:
        raise
    except Exception as e:
        logger.warning("WFO 取得に失敗: %s (%s)", strategy_id, e)
        raise HTTPException(
            status_code=404, detail=f"WFO 結果の取得に失敗しました: {strategy_id}"
        ) from e

    return {
        "strategy_id": strategy_id,
        "strategy_name": _resolve_strategy_name(config, strategy_id),
        "symbol": symbol,
        "windows": windows,
        "composite_equity": composite_equity,
        "composite_dates": composite_dates,
    }
