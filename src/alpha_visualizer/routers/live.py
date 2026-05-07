"""ライブ実績 API ルーター

`/api/live` (一覧) と `/api/live/{strategy_id}` (詳細) を提供する。
forge_dir/data/live/ 配下の JSON ファイルへのアクセスは
``LiveDataRepository`` に集約し、本モジュールは HTTP 変換と
期間整合 diff の純粋ロジックのみを担当する。

ファイル構造:
- ``<live_dir>/summaries/<strategy_id>.live.summary.json``
- ``<live_dir>/trades/<strategy_id>.trades.json``
"""
from __future__ import annotations

import json
import logging
import math
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from alpha_visualizer.dependencies import get_live_repo
from alpha_visualizer.errors import NotFoundError
from alpha_visualizer.repositories.live import LiveDataRepository

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
    repo: LiveDataRepository, strategy_id: str
) -> dict[str, Any] | None:
    """live summary を辞書で取得し、``strategy_id`` キーを補完する。

    Repository が返す dict を直接 mutate せず、shallow copy 上で補完する。
    """
    raw = repo.load_summary(strategy_id)
    if raw is None:
        return None
    summary = dict(raw)
    if summary.get("strategy_id") in (None, ""):
        summary["strategy_id"] = strategy_id
    return summary


def _load_live_trades(
    repo: LiveDataRepository, strategy_id: str
) -> list[dict[str, Any]]:
    """live trades を正規化済みのリストで返す。"""
    out: list[dict[str, Any]] = []
    for item in repo.load_raw_trades(strategy_id):
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


def _backtest_record_for_diff(
    repo: LiveDataRepository,
    strategy_id: str,
    run_id: str | None,
) -> dict[str, Any] | None:
    """``backtest_results`` から該当行を取り、必要に応じて trades_json をパースする。

    DB ファイル不在やテーブル無し等のエラーは ``None`` を返し、Router 側で
    warning を組み立てて 200 応答する（既存挙動の踏襲）。
    """
    try:
        row = repo.fetch_backtest_for_diff(strategy_id, run_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("backtest_results 取得失敗 (%s): %s", strategy_id, exc)
        return None
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
async def list_live(
    repo: Annotated[LiveDataRepository, Depends(get_live_repo)],
) -> list[dict[str, Any]]:
    """live summary が存在する戦略 ID 一覧を返す。

    フロントの「Live」タブ表示判定に使う。
    """
    items: list[dict[str, Any]] = []
    for sid in repo.list_summary_strategy_ids():
        items.append(
            {
                "strategy_id": sid,
                "has_summary": repo.has_summary(sid),
                "has_trades": repo.has_trades(sid),
            }
        )
    return items


@router.get("/live/{strategy_id}")
async def get_live(
    strategy_id: str,
    repo: Annotated[LiveDataRepository, Depends(get_live_repo)],
    run_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """指定戦略の live summary + trades と、期間整合した backtest aligned/diff を返す。"""
    summary = _load_live_summary(repo, strategy_id)
    if summary is None:
        raise NotFoundError(
            f"strategy_id '{strategy_id}' の live summary が見つかりません",
        )

    trades = _load_live_trades(repo, strategy_id)
    period = _trade_period(trades)
    warnings: list[str] = []

    backtest: dict[str, Any] | None = None
    diff: dict[str, Any] | None = None
    if period is None:
        warnings.append(
            "live trades が無いため backtest との期間整合 diff は計算できません"
        )
    else:
        record = _backtest_record_for_diff(repo, strategy_id, run_id)
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
