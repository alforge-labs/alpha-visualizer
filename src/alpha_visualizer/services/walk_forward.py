"""ウォークフォーワード結果の整形 services。

`routers/wfo.py` から切り出した純関数群。

- ``extract_windows(all_trials)`` → ウィンドウ列を整形
- ``parse_equity_curve(raw_json)`` → equity_curve_json を (date, value) タプル列にパース
- ``normalize_to_anchor(values, anchor)`` → 先頭が anchor になるよう比例スケール
- ``slice_oos_segment(points, oos_start, oos_end)`` → OOS 期間で切り出し
- ``interpolate_window_curve(...)`` → 日次線形補間カーブ生成（フォールバック）
- ``extract_composite_curve(windows, fetch_oos_curve_json)`` → OOS 合成カーブを構築

Patterns: Pure Function / Dependency Injection（``extract_composite_curve``
は backtest_results.db への問い合わせ Callable を引数で受ける）/ Composition over Inheritance。
services 層は HTTP の関心事を持たない。
"""
from __future__ import annotations

import json
import logging
import math
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger(__name__)


def extract_windows(all_trials: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """``all_trials_json`` から WFO 形式のウィンドウ列を抽出して整形する。

    WFO 形式と判定する条件: ``window_id`` または ``is_sharpe`` が含まれること。
    """
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
        oos_return = float(
            trial.get("oos_return_pct") or trial.get("oos_return") or 0.0
        )
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


def parse_equity_curve(raw_json: str | None) -> list[tuple[str, float]]:
    """``equity_curve_json`` を ``(date_str, value)`` タプルのリストにパースする。

    壊れた JSON や不正な要素は黙って除外し、健全なポイントのみ返す。
    NaN は ``v == v`` 判定で除外する。
    """
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
        if not (isinstance(d, str) and d and isinstance(v, (int, float))):
            continue
        # NaN は数値として扱わない。bool は int サブクラスで NaN になり得ないため
        # float のときだけ math.isnan を判定すればよい。
        if isinstance(v, float) and math.isnan(v):
            continue
        result.append((d, float(v)))
    return result


def normalize_to_anchor(values: list[float], anchor: float) -> list[float]:
    """``values`` の先頭が ``anchor`` になるよう比例スケールして返す。"""
    if not values:
        return []
    first = values[0]
    if first == 0.0:
        return [anchor] * len(values)
    scale = anchor / first
    return [v * scale for v in values]


def slice_oos_segment(
    points: list[tuple[str, float]],
    oos_start: str,
    oos_end: str,
) -> list[tuple[str, float]]:
    """OOS 期間（``oos_start <= date <= oos_end``）のポイントを抽出する。"""
    result = [p for p in points if p[0] >= oos_start]
    if oos_end:
        result = [p for p in result if p[0] <= oos_end]
    return result


def interpolate_window_curve(
    oos_start: str,
    oos_end: str,
    oos_return_pct: float,
    anchor: float,
) -> tuple[list[str], list[float]]:
    """OOS リターン % から日次線形補間カーブを生成する（フォールバック用）。

    ``oos_start`` から ``oos_end`` までの日次曲線を、最終リターンが
    ``oos_return_pct`` になるように線形補間する。日付不正・期間ゼロ以下なら
    ``([], [])`` を返す。
    """
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


def extract_composite_curve(
    windows: list[dict[str, Any]],
    fetch_oos_curve_json: Callable[[str], str | None],
) -> tuple[list[float], list[str]]:
    """各 OOS ウィンドウのエクイティを連結した合成カーブを返す。

    各ウィンドウは ``fetch_oos_curve_json(oos_start)`` を呼び出して
    ``equity_curve_json`` を取得する。取得失敗または欠損時は
    ``oos_return`` から線形補間でフォールバックする。

    ``fetch_oos_curve_json`` は I/O を行う Callable（DI 注入）。services 自体は
    DB を知らず、純粋な合成ロジックに集中する（Dependency Injection Pattern）。
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
            equity_curve_json = fetch_oos_curve_json(oos_start)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "OOS equity curve 取得失敗 (oos_start=%s): %s", oos_start, exc
            )
            equity_curve_json = None

        if equity_curve_json:
            points = parse_equity_curve(equity_curve_json)
            sliced = slice_oos_segment(points, oos_start, oos_end)
            if sliced:
                raw_values = [v for _, v in sliced]
                seg_dates = [d for d, _ in sliced]
                seg_values = normalize_to_anchor(raw_values, anchor)

        if not seg_dates:
            oos_return = float(window.get("oos_return") or 0.0)
            seg_dates, seg_values = interpolate_window_curve(
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


__all__ = [
    "extract_composite_curve",
    "extract_windows",
    "interpolate_window_curve",
    "normalize_to_anchor",
    "parse_equity_curve",
    "slice_oos_segment",
]
