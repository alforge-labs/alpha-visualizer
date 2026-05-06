"""ライブ実績 API ルーター

`/api/live` (一覧) と `/api/live/{strategy_id}` (詳細) を提供する。
forge_dir/data/live/ 配下の JSON ファイルを直接読み取り、
バックテスト trades と期間整合した diff を返す。

ファイル構造:
- ``<live_dir>/summaries/<strategy_id>.live.summary.json``
- ``<live_dir>/trades/<strategy_id>.trades.json``
"""
from __future__ import annotations

import json
import logging
import math
import pathlib
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import create_engine

from alpha_visualizer.db import backtest_results
from alpha_visualizer.forge_config import ForgeConfig

logger = logging.getLogger(__name__)

router = APIRouter()

# レスポンスでの trades 上限（フロントの初期表示用）
_MAX_TRADES = 200

# diff 計算で比較するメトリック
_DIFF_METRICS = (
    "total_trades",
    "win_rate_pct",
    "profit_factor",
    "max_drawdown_pct",
    "net_pnl",
)


def _summary_path(config: ForgeConfig, strategy_id: str) -> pathlib.Path:
    return config.live_dir / "summaries" / f"{strategy_id}.live.summary.json"


def _trades_path(config: ForgeConfig, strategy_id: str) -> pathlib.Path:
    return config.live_dir / "trades" / f"{strategy_id}.trades.json"


def _read_json(path: pathlib.Path) -> Any:
    """JSON を読み、存在しないか不正なら ``None`` を返す。"""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("%s の読み込みに失敗: %s", path, e)
        return None


def _list_summary_strategy_ids(config: ForgeConfig) -> list[str]:
    """summaries ディレクトリから戦略 ID の集合を抽出する。"""
    summaries_dir = config.live_dir / "summaries"
    if not summaries_dir.exists():
        return []
    suffix = ".live.summary.json"
    ids: set[str] = set()
    for path in summaries_dir.glob(f"*{suffix}"):
        name = path.name
        if name.endswith(suffix):
            ids.add(name[: -len(suffix)])
    return sorted(ids)


def _normalize_trade(raw: dict[str, Any]) -> dict[str, Any] | None:
    """live trades JSON の 1 件を正規化する。entry_at / exit_at が無ければ None。"""
    entry_at = raw.get("entry_at") or raw.get("entry_date")
    exit_at = raw.get("exit_at") or raw.get("exit_date")
    if not entry_at or not exit_at:
        return None
    side_raw = str(raw.get("side") or raw.get("direction") or "long").lower()
    side = "long" if side_raw.startswith("long") else "short"
    return {
        "trade_id": str(raw.get("trade_id") or raw.get("id") or ""),
        "symbol": str(raw.get("symbol") or ""),
        "side": side,
        "entry_at": str(entry_at),
        "exit_at": str(exit_at),
        "qty": _safe_float(raw.get("qty")),
        "entry_price": _safe_float(raw.get("entry_price")),
        "exit_price": _safe_float(raw.get("exit_price")),
        "net_pnl": _safe_float(raw.get("net_pnl") or raw.get("pnl")),
        "return_pct": _optional_float(raw.get("return_pct")),
        "exit_reason": raw.get("exit_reason"),
    }


def _safe_float(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _load_live_summary(
    config: ForgeConfig, strategy_id: str
) -> dict[str, Any] | None:
    raw = _read_json(_summary_path(config, strategy_id))
    if not isinstance(raw, dict):
        return None
    if raw.get("strategy_id") in (None, ""):
        raw["strategy_id"] = strategy_id
    return raw


def _load_live_trades(
    config: ForgeConfig, strategy_id: str
) -> list[dict[str, Any]]:
    raw = _read_json(_trades_path(config, strategy_id))
    if raw is None:
        return []
    items: list[Any]
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        items = list(raw.get("trades") or [])
    else:
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized = _normalize_trade(item)
        if normalized is not None:
            out.append(normalized)
    return out


def _trade_period(trades: list[dict[str, Any]]) -> dict[str, str] | None:
    """live trades の最初・最後の日時から期間を算出する。"""
    if not trades:
        return None
    starts = [t["entry_at"] for t in trades if t.get("entry_at")]
    ends = [t["exit_at"] for t in trades if t.get("exit_at")]
    if not starts or not ends:
        return None
    return {"start": min(starts), "end": max(ends)}


def _date_in_period(date_str: str, period: dict[str, str]) -> bool:
    """文字列（ISO8601 / YYYY-MM-DD）の自然順比較で期間内かを判定する。"""
    if not date_str:
        return False
    return period["start"] <= date_str <= period["end"]


def _aligned_aggregates(
    trades: list[dict[str, Any]], period: dict[str, str]
) -> dict[str, Any] | None:
    """backtest trades を period でフィルタし、aligned メトリクスを再計算する。"""
    if not trades:
        return None
    filtered: list[dict[str, Any]] = []
    for t in trades:
        exit_date = str(t.get("exit_date") or "")
        if exit_date and _date_in_period(exit_date, period):
            filtered.append(t)
    if not filtered:
        return None

    total = len(filtered)
    wins = [t for t in filtered if _safe_float(t.get("return_pct")) > 0]
    win_rate = (len(wins) / total * 100.0) if total > 0 else 0.0

    gross_win = sum(_safe_float(t.get("pnl")) for t in wins)
    losses_pnl = [
        _safe_float(t.get("pnl"))
        for t in filtered
        if _safe_float(t.get("return_pct")) <= 0
    ]
    gross_loss = sum(losses_pnl)
    if gross_loss < 0:
        profit_factor = gross_win / abs(gross_loss)
    else:
        profit_factor = 0.0

    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    sorted_filtered = sorted(filtered, key=lambda t: str(t.get("exit_date") or ""))
    for t in sorted_filtered:
        cumulative += _safe_float(t.get("return_pct"))
        peak = max(peak, cumulative)
        max_dd = min(max_dd, cumulative - peak)

    net_pnl_total = sum(_safe_float(t.get("pnl")) for t in filtered)

    return {
        "total_trades": total,
        "win_rate_pct": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "max_drawdown_pct": round(max_dd, 4),
        "net_pnl": round(net_pnl_total, 4) if net_pnl_total != 0 else 0.0,
    }


def _diff_value(live: Any, aligned: Any) -> float | None:
    if live is None or aligned is None:
        return None
    try:
        return round(float(live) - float(aligned), 4)
    except (TypeError, ValueError):
        return None


def _compute_diff(
    summary: dict[str, Any],
    aligned: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if aligned is None:
        return None
    diff: dict[str, Any] = {}
    for key in _DIFF_METRICS:
        diff[key] = _diff_value(summary.get(key), aligned.get(key))
    if all(v is None for v in diff.values()):
        return None
    return diff


def _fetch_backtest_record(
    config: ForgeConfig,
    strategy_id: str,
    run_id: str | None,
) -> dict[str, Any] | None:
    """forge.db から backtest_results を取得し、必要に応じて trades_json をパースする。"""
    db_path = config.forge_db
    if not db_path.exists():
        return None
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.connect() as conn:
        if run_id:
            row = conn.execute(
                backtest_results.select().where(backtest_results.c.run_id == run_id)
            ).first()
        else:
            row = conn.execute(
                backtest_results.select()
                .where(backtest_results.c.strategy_id == strategy_id)
                .order_by(backtest_results.c.run_at.desc())
                .limit(1)
            ).first()
    if row is None:
        return None

    trades: list[dict[str, Any]] = []
    if row.trades_json:
        try:
            parsed = json.loads(row.trades_json)
            if isinstance(parsed, list):
                trades = [t for t in parsed if isinstance(t, dict)]
        except (json.JSONDecodeError, TypeError):
            trades = []

    return {
        "run_id": row.run_id,
        "strategy_id": row.strategy_id,
        "trades": trades,
    }


@router.get("/live")
async def list_live(request: Request) -> list[dict[str, Any]]:
    """live summary が存在する戦略 ID 一覧を返す。

    フロントの「Live」タブ表示判定に使う。
    """
    config: ForgeConfig = request.app.state.forge_config
    items: list[dict[str, Any]] = []
    for sid in _list_summary_strategy_ids(config):
        items.append(
            {
                "strategy_id": sid,
                "has_summary": _summary_path(config, sid).exists(),
                "has_trades": _trades_path(config, sid).exists(),
            }
        )
    return items


@router.get("/live/{strategy_id}")
async def get_live(
    strategy_id: str,
    request: Request,
    run_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """指定戦略の live summary + trades と、期間整合した backtest aligned/diff を返す。"""
    config: ForgeConfig = request.app.state.forge_config

    summary = _load_live_summary(config, strategy_id)
    if summary is None:
        raise HTTPException(
            status_code=404,
            detail=f"strategy_id '{strategy_id}' の live summary が見つかりません",
        )

    trades = _load_live_trades(config, strategy_id)
    period = _trade_period(trades)
    warnings: list[str] = []

    backtest: dict[str, Any] | None = None
    diff: dict[str, Any] | None = None
    if period is None:
        warnings.append(
            "live trades が無いため backtest との期間整合 diff は計算できません"
        )
    else:
        record = _fetch_backtest_record(config, strategy_id, run_id)
        if record is None:
            warnings.append("対応する backtest run が見つかりません")
        else:
            aligned = _aligned_aggregates(record["trades"], period)
            if aligned is None:
                warnings.append("対象期間に backtest trade が存在しません")
                backtest = {
                    "run_id": record["run_id"],
                    "period": period,
                    "aligned": None,
                }
            else:
                backtest = {
                    "run_id": record["run_id"],
                    "period": period,
                    "aligned": aligned,
                }
                diff = _compute_diff(summary, aligned)

    return {
        "strategy_id": strategy_id,
        "live": {
            "summary": summary,
            "trades": trades[:_MAX_TRADES],
            "period": period,
        },
        "backtest": backtest,
        "diff": diff,
        "warnings": warnings,
    }


__all__ = ["router"]
