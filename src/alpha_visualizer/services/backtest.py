"""バックテスト結果の整形 services。

`routers/results.py` から切り出した純関数群。

- ``summarize_row(row)`` → ``/api/results`` リスト 1 件分
- ``build_detail(row)`` → ``/api/results/{run_id}`` 詳細レスポンス
- ``shape_*`` / ``compute_*`` / ``split_*`` などの構成要素は public な
  pure function として export する

Patterns: Builder Pattern（``build_detail``）/ Pure Function /
Composition over Inheritance / Immutability。
services 層は HTTP の関心事（status code・例外変換）を持たず、
不正値は素の ``ValueError`` などで上位に伝播させる。
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime
from typing import Any

from alpha_visualizer.repositories.backtest_results import BacktestResultRow

logger = logging.getLogger(__name__)


def parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)


def shape_monthly_returns(raw: dict[str, float] | None) -> dict[int, list[float | None]]:
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


def shape_annual_returns(raw: dict[str, float] | None) -> dict[int, float]:
    if not raw:
        return {}
    result: dict[int, float] = {}
    for year_str, pct in raw.items():
        try:
            result[int(year_str)] = float(pct)
        except (ValueError, TypeError):
            continue
    return result


def shape_regime_series(
    raw: Any, equity_dates: list[str]
) -> dict[str, Any] | None:
    """metrics_json の regime_series を検証・整形する。

    壊れたデータ（型不正・長さ不一致など）はログを出して None を返し、
    レスポンスから完全に除外する。
    """
    if not isinstance(raw, dict):
        return None
    raw_dates = raw.get("dates")
    raw_states = raw.get("states")
    if not isinstance(raw_dates, list) or not isinstance(raw_states, list):
        return None
    if len(raw_dates) != len(raw_states):
        logger.warning(
            "regime_series: dates length (%d) != states length (%d); skipping",
            len(raw_dates),
            len(raw_states),
        )
        return None
    if equity_dates and len(raw_dates) != len(equity_dates):
        logger.warning(
            "regime_series: dates length (%d) != equity dates length (%d); skipping",
            len(raw_dates),
            len(equity_dates),
        )
        return None
    try:
        states = [int(s) for s in raw_states]
    except (TypeError, ValueError):
        logger.warning("regime_series: states contains non-int values; skipping")
        return None
    if any(isinstance(s, bool) for s in raw_states):
        # bool は int サブクラスなので明示的に除外
        logger.warning("regime_series: states contains bool values; skipping")
        return None
    raw_n_states = raw.get("n_states")
    try:
        n_states = int(raw_n_states) if raw_n_states is not None else (
            max(states) + 1 if states else 0
        )
    except (TypeError, ValueError):
        n_states = max(states) + 1 if states else 0
    out: dict[str, Any] = {
        "dates": [str(d) for d in raw_dates],
        "states": states,
        "n_states": n_states,
    }
    label_names = raw.get("label_names")
    if isinstance(label_names, dict):
        out["label_names"] = {str(k): str(v) for k, v in label_names.items()}
    return out


def shape_regime_breakdown(raw: Any) -> dict[str, Any] | None:
    """forge の RegimeBreakdown.to_dict() 形式をパススルー（最低限の検証付き）。"""
    if not isinstance(raw, dict):
        return None
    if not isinstance(raw.get("periods"), list):
        return None
    if not isinstance(raw.get("aggregates"), dict):
        return None
    return raw


def shape_trades(
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


def compute_drawdown(values: list[float]) -> list[float]:
    """equity 列から各時点の drawdown 系列 (%) を計算する。

    Precondition:
        ``values`` の各要素は **正の値**（現実のエクイティ）であることを想定する。
        負値時は分母 (peak) が負になり、drawdown の意味論（peak 比の下方乖離）が
        破綻する。例: ``[-0.5, -1.0]`` → ``[0, 100.0]`` (PR #134 の property-based
        テストで検出した既知の制約)。

    Returns:
        各時点の drawdown を **% で表した非正値** のリスト。長さは入力と同じ。
        空配列入力の場合は空配列を返す。
    """
    if not values:
        return []
    out: list[float] = []
    peak = values[0]
    for v in values:
        if v > peak:
            peak = v
        out.append(0.0 if peak == 0 else (v - peak) / peak * 100.0)
    return out


def compute_daily_returns(values: list[float]) -> list[float]:
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


def compute_buy_hold_equity(record: dict[str, Any]) -> list[float]:
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


def compute_benchmark_annual_returns(
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


def shape_equity(raw: list[Any] | None) -> tuple[list[str], list[float]]:
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


def is_cutoff(dates: list[str], oos_start: str | None) -> dict[str, Any]:
    if not oos_start or not dates:
        return {"date": None, "index": -1}
    target = oos_start[:10] if len(oos_start) >= 10 else oos_start
    for i, d in enumerate(dates):
        if d >= target:
            prev = dates[i - 1] if i > 0 else None
            return {"date": prev, "index": i}
    return {"date": dates[-1] if dates else None, "index": len(dates)}


def split_metrics(
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


def row_to_dict(row: BacktestResultRow) -> dict[str, Any]:
    """``BacktestResultRow`` をフラットな dict に変換する。metrics_json 等を展開する。"""
    metrics: dict[str, Any] = {}
    if row.metrics_json:
        try:
            metrics = json.loads(row.metrics_json)
        except (json.JSONDecodeError, TypeError) as exc:
            # 破損 JSON や旧フォーマット混入時は空 dict のまま続行する
            # （UI 側で不在として扱える）。診断のため debug 出力のみ残す。
            logger.debug("metrics_json のパースに失敗: %s", exc)

    equity_curve: list[Any] = []
    if row.equity_curve_json:
        try:
            equity_curve = json.loads(row.equity_curve_json)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.debug("equity_curve_json のパースに失敗: %s", exc)

    buy_hold_curve: list[Any] = []
    if row.buy_hold_curve_json:
        try:
            buy_hold_curve = json.loads(row.buy_hold_curve_json)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.debug("buy_hold_curve_json のパースに失敗: %s", exc)

    trades: list[Any] = []
    if row.trades_json:
        try:
            trades = json.loads(row.trades_json)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.debug("trades_json のパースに失敗: %s", exc)

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


def summarize_row(row: BacktestResultRow) -> dict[str, Any]:
    """``/api/results`` 一覧用のサマリ dict を生成する。

    既存レスポンスとの互換性を維持するため、キーは従来のまま 8 フィールドのみを返す。
    """
    return {
        "run_id": row.run_id,
        "strategy_id": row.strategy_id,
        "symbol": row.symbol,
        "run_at": row.run_at,
        "sharpe_ratio": row.sharpe_ratio,
        "total_return_pct": row.total_return_pct,
        "max_drawdown_pct": row.max_drawdown_pct,
        "total_trades": row.total_trades,
    }


def _shape_detail_from_record(record: dict[str, Any]) -> dict[str, Any]:
    """``row_to_dict`` で得た dict 表現をフロント向けレスポンス形式に整形する。"""
    metrics: dict[str, Any] = dict(record.get("metrics") or {})
    metrics["annual_returns"] = shape_annual_returns(metrics.get("annual_returns"))
    raw_equity = record.get("equity_curve")
    dates, values = shape_equity(raw_equity)
    drawdown = compute_drawdown(values)
    cutoff = is_cutoff(dates, record.get("oos_start"))
    monthly = shape_monthly_returns(metrics.get("monthly_returns"))
    trade_analysis = metrics.get("trade_analysis") or {}
    trades = shape_trades(record.get("trades"), trade_analysis)
    is_m, oos_m = split_metrics(metrics, cutoff["index"], len(values))
    period_start = dates[0][:7] if dates else ""
    period_end = dates[-1][:7] if dates else ""
    buy_hold_vals = compute_buy_hold_equity(record)
    benchmark_annual = (
        compute_benchmark_annual_returns(dates, buy_hold_vals) if buy_hold_vals else {}
    )

    regime_series = shape_regime_series(metrics.get("regime_series"), dates)
    regime_breakdown = shape_regime_breakdown(metrics.get("regime_breakdown"))
    # 既存 BacktestMetrics 型に regime キーが混入しないよう metrics 側からは除去
    metrics.pop("regime_series", None)
    metrics.pop("regime_breakdown", None)

    result: dict[str, Any] = {
        "run_id": record.get("run_id", ""),
        "strategy_id": record.get("strategy_id", ""),
        "strategy_name": record.get("strategy_id", ""),
        "symbol": record.get("symbol", ""),
        "timeframe": record.get("timeframe", "1d"),
        "run_at": record.get("run_at", ""),
        "period": {"start": period_start, "end": period_end},
        "equity": {"dates": dates, "values": values},
        "drawdown": drawdown,
        "daily_returns": compute_daily_returns(values),
        "buy_hold_equity": buy_hold_vals,
        "is_cutoff": cutoff,
        "metrics": metrics,
        "is_metrics": is_m,
        "oos_metrics": oos_m,
        "monthly_returns": monthly,
        "trades": trades,
        "benchmark_annual_returns": benchmark_annual,
    }
    if regime_series is not None:
        result["regime_series"] = regime_series
    if regime_breakdown is not None:
        result["regime_breakdown"] = regime_breakdown
    return result


def build_detail(row: BacktestResultRow) -> dict[str, Any]:
    """Builder エントリポイント: 1 行の Repository DTO を詳細レスポンス dict に変換する。

    内部で ``row_to_dict`` でフラット化した後、各 ``shape_*`` / ``compute_*``
    純関数を合成して整形済みレスポンスを組み立てる。
    """
    return _shape_detail_from_record(row_to_dict(row))


def filter_by_since(
    rows: list[BacktestResultRow], since: datetime | None
) -> list[BacktestResultRow]:
    """``since`` 指定時に ``run_at`` を Python 側でパースして閾値以降の行のみ残す。"""
    if since is None:
        return rows
    out: list[BacktestResultRow] = []
    for r in rows:
        try:
            if parse_dt(r.run_at or "") < since:
                continue
        except ValueError:
            # run_at がパース不能でも従来通り残す（既存挙動の保持）
            pass
        out.append(r)
    return out


__all__ = [
    "build_detail",
    "compute_benchmark_annual_returns",
    "compute_buy_hold_equity",
    "compute_daily_returns",
    "compute_drawdown",
    "filter_by_since",
    "is_cutoff",
    "parse_dt",
    "row_to_dict",
    "shape_annual_returns",
    "shape_equity",
    "shape_monthly_returns",
    "shape_regime_breakdown",
    "shape_regime_series",
    "shape_trades",
    "split_metrics",
    "summarize_row",
]
