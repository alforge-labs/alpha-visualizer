"""ライブ実績の整形 services。

`routers/live.py` から切り出した純関数群。

- ``safe_float(value)`` / ``optional_float(value)`` → 安全な数値変換
- ``normalize_trade(raw)`` → 1 trade JSON を正規化
- ``trade_period(trades)`` → trades 全体の期間を算出
- ``date_in_period(date_str, period)`` → 期間内判定
- ``aligned_aggregates(trades, period)`` → 期間整合 backtest 集計
- ``diff_value(live, aligned)`` → 単一指標差分
- ``compute_diff(summary, aligned)`` → 全 ``DIFF_METRICS`` の差分

Patterns: Pure Function / Immutability / Composition over Inheritance。
すべて副作用なし、I/O は呼び出し側（Router / Repository）が担う。
"""
from __future__ import annotations

import math
from typing import Any, Final

# diff 計算で比較するメトリクスキー
DIFF_METRICS: Final[tuple[str, ...]] = (
    "total_trades",
    "win_rate_pct",
    "profit_factor",
    "max_drawdown_pct",
    "net_pnl",
)


def safe_float(value: Any) -> float:
    """値を float に変換、失敗 / 非有限なら 0.0。"""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def optional_float(value: Any) -> float | None:
    """値を float に変換、None・失敗・非有限なら None。"""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def normalize_trade(raw: dict[str, Any]) -> dict[str, Any] | None:
    """live trades JSON の 1 件を正規化する。``entry_at``/``exit_at`` 必須。"""
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
        "qty": safe_float(raw.get("qty")),
        "entry_price": safe_float(raw.get("entry_price")),
        "exit_price": safe_float(raw.get("exit_price")),
        "net_pnl": safe_float(raw.get("net_pnl") or raw.get("pnl")),
        "return_pct": optional_float(raw.get("return_pct")),
        "exit_reason": raw.get("exit_reason"),
    }


def trade_period(trades: list[dict[str, Any]]) -> dict[str, str] | None:
    """live trades の最初・最後の日時から期間を算出する。"""
    if not trades:
        return None
    starts = [t["entry_at"] for t in trades if t.get("entry_at")]
    ends = [t["exit_at"] for t in trades if t.get("exit_at")]
    if not starts or not ends:
        return None
    return {"start": min(starts), "end": max(ends)}


def date_in_period(date_str: str, period: dict[str, str]) -> bool:
    """文字列（ISO8601 / YYYY-MM-DD）の自然順比較で期間内かを判定する。"""
    if not date_str:
        return False
    return period["start"] <= date_str <= period["end"]


def aligned_aggregates(
    trades: list[dict[str, Any]], period: dict[str, str]
) -> dict[str, Any] | None:
    """backtest trades を ``period`` でフィルタし、aligned メトリクスを再計算する。

    ``period`` 内に該当する trade が無ければ ``None``。返り値は
    ``total_trades`` / ``win_rate_pct`` / ``profit_factor`` /
    ``max_drawdown_pct`` / ``net_pnl`` の 5 メトリクス。
    """
    if not trades:
        return None
    filtered: list[dict[str, Any]] = []
    for t in trades:
        exit_date = str(t.get("exit_date") or "")
        if exit_date and date_in_period(exit_date, period):
            filtered.append(t)
    if not filtered:
        return None

    total = len(filtered)
    wins = [t for t in filtered if safe_float(t.get("return_pct")) > 0]
    win_rate = (len(wins) / total * 100.0) if total > 0 else 0.0

    gross_win = sum(safe_float(t.get("pnl")) for t in wins)
    losses_pnl = [
        safe_float(t.get("pnl"))
        for t in filtered
        if safe_float(t.get("return_pct")) <= 0
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
        cumulative += safe_float(t.get("return_pct"))
        peak = max(peak, cumulative)
        max_dd = min(max_dd, cumulative - peak)

    net_pnl_total = sum(safe_float(t.get("pnl")) for t in filtered)

    return {
        "total_trades": total,
        "win_rate_pct": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "max_drawdown_pct": round(max_dd, 4),
        "net_pnl": round(net_pnl_total, 4) if net_pnl_total != 0 else 0.0,
    }


def diff_value(live: Any, aligned: Any) -> float | None:
    """``live - aligned`` の差分を返す。どちらか None / 数値変換失敗なら None。"""
    if live is None or aligned is None:
        return None
    try:
        return round(float(live) - float(aligned), 4)
    except (TypeError, ValueError):
        return None


def compute_diff(
    summary: dict[str, Any],
    aligned: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """``DIFF_METRICS`` の各メトリクスについて ``live - aligned`` の差分を返す。

    全メトリクスが None の場合（aligned が None または各値が比較不能）は None。
    """
    if aligned is None:
        return None
    diff: dict[str, Any] = {}
    for key in DIFF_METRICS:
        diff[key] = diff_value(summary.get(key), aligned.get(key))
    if all(v is None for v in diff.values()):
        return None
    return diff


def position_detail(portfolio_id: str, pos: dict[str, Any]) -> dict[str, Any]:
    """position ベース combine サマリを ``LiveDetail`` 互換の dict に整形する。

    trade 単位ではないため ``trades`` 空・``period``/``backtest``/``diff`` は
    ``None``。live metrics・equity 系列・``--compare`` 時の backtest metrics は
    ``live.summary`` に載せてフロントへ渡す（``summary`` は柔軟な dict）。
    """
    summary: dict[str, Any] = {
        "strategy_id": portfolio_id,
        "portfolio_id": portfolio_id,
        "kind": "position",
        "metrics": pos.get("metrics") or {},
        "backtest_metrics": pos.get("backtest_metrics"),
        "equity": pos.get("equity") or [],
        "receipts_count": pos.get("receipts_count"),
        "sub_strategies": pos.get("sub_strategies") or [],
        "updated_at": pos.get("updated_at"),
    }
    return {
        "strategy_id": portfolio_id,
        "live": {"summary": summary, "trades": [], "period": None},
        "backtest": None,
        "diff": None,
        "warnings": [
            "position ベースの combine portfolio のため trade 単位の backtest diff はありません"
        ],
    }


__all__ = [
    "DIFF_METRICS",
    "aligned_aggregates",
    "compute_diff",
    "date_in_period",
    "diff_value",
    "normalize_trade",
    "optional_float",
    "position_detail",
    "safe_float",
    "trade_period",
]
