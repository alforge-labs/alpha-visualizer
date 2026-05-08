"""``services.wfo`` 純関数のユニットテスト。"""

from __future__ import annotations

import json
from typing import Any

import pytest

from alpha_visualizer.services.wfo import (
    extract_composite_curve,
    extract_windows,
    interpolate_window_curve,
    normalize_to_anchor,
    parse_equity_curve,
    slice_oos_segment,
)


class TestExtractWindows:
    def test_returns_empty_for_none(self) -> None:
        assert extract_windows(None) == []

    def test_returns_empty_for_empty_list(self) -> None:
        assert extract_windows([]) == []

    def test_skips_non_dict_items(self) -> None:
        assert extract_windows([1, "a", None]) == []

    def test_skips_non_wfo_trials(self) -> None:
        # window_id も is_sharpe も無いものは除外（grid trial 形式）
        trials = [{"sharpe_ratio": 1.0, "fast": 10}]
        assert extract_windows(trials) == []

    def test_normalizes_minimum_window(self) -> None:
        trials = [{"window_id": 1, "is_sharpe": 1.2, "oos_sharpe": 0.6}]
        result = extract_windows(trials)
        assert len(result) == 1
        w = result[0]
        assert w["id"] == 1
        assert w["label"] == "W1"
        assert w["is_sharpe"] == pytest.approx(1.2)
        assert w["oos_sharpe"] == pytest.approx(0.6)
        assert w["oos_is_ratio"] == pytest.approx(0.5)
        assert w["pass"] is True  # oos_sharpe > 0

    def test_label_falls_back_to_index(self) -> None:
        trials = [
            {"is_sharpe": 1.0, "oos_sharpe": 0.5},
            {"is_sharpe": 1.0, "oos_sharpe": 0.5},
        ]
        result = extract_windows(trials)
        assert [w["label"] for w in result] == ["W1", "W2"]

    def test_handles_alt_return_keys(self) -> None:
        trials = [
            {
                "window_id": 1,
                "is_sharpe": 1.0,
                "oos_sharpe": 0.5,
                "is_return_pct": 5.0,
                "oos_return_pct": 2.0,
            }
        ]
        result = extract_windows(trials)
        assert result[0]["is_return"] == pytest.approx(5.0)
        assert result[0]["oos_return"] == pytest.approx(2.0)

    def test_params_filters_non_numeric(self) -> None:
        trials = [
            {
                "window_id": 1,
                "is_sharpe": 1.0,
                "oos_sharpe": 0.5,
                "params": {"fast": 10, "slow": 30, "method": "sma"},
            }
        ]
        result = extract_windows(trials)
        assert result[0]["params"] == {"fast": 10.0, "slow": 30.0}

    def test_pass_explicit_false_overrides_default(self) -> None:
        trials = [
            {"window_id": 1, "is_sharpe": 1.0, "oos_sharpe": 1.5, "pass": False}
        ]
        result = extract_windows(trials)
        assert result[0]["pass"] is False


class TestParseEquityCurve:
    def test_returns_empty_for_none(self) -> None:
        assert parse_equity_curve(None) == []

    def test_returns_empty_for_invalid_json(self) -> None:
        assert parse_equity_curve("not json") == []

    def test_parses_valid_curve(self) -> None:
        raw = json.dumps(
            [
                {"date": "2024-01-02", "value": 100.0},
                {"date": "2024-01-03", "value": 101.5},
            ]
        )
        assert parse_equity_curve(raw) == [
            ("2024-01-02", 100.0),
            ("2024-01-03", 101.5),
        ]

    def test_skips_invalid_items(self) -> None:
        raw = json.dumps(
            [
                {"date": "2024-01-02", "value": 100.0},
                {"date": "2024-01-03"},  # value 欠損
                "junk",  # 非 dict
                {"date": "", "value": 102.0},  # date 空
            ]
        )
        assert parse_equity_curve(raw) == [("2024-01-02", 100.0)]

    def test_excludes_nan(self) -> None:
        raw = json.dumps(
            [{"date": "2024-01-02", "value": 100.0}, {"date": "2024-01-03", "value": float("nan")}]
        )
        result = parse_equity_curve(raw)
        assert result == [("2024-01-02", 100.0)]


class TestNormalizeToAnchor:
    def test_empty_returns_empty(self) -> None:
        assert normalize_to_anchor([], 100.0) == []

    def test_first_becomes_anchor(self) -> None:
        result = normalize_to_anchor([200.0, 220.0, 180.0], 100.0)
        assert result[0] == pytest.approx(100.0)
        assert result[1] == pytest.approx(110.0)
        assert result[2] == pytest.approx(90.0)

    def test_zero_first_returns_constant(self) -> None:
        # ゼロ除算回避
        assert normalize_to_anchor([0.0, 1.0, 2.0], 50.0) == [50.0, 50.0, 50.0]


class TestSliceOosSegment:
    def test_filters_inclusive_range(self) -> None:
        points = [
            ("2024-01-01", 100.0),
            ("2024-02-01", 102.0),
            ("2024-03-01", 105.0),
            ("2024-04-01", 110.0),
        ]
        result = slice_oos_segment(points, "2024-02-01", "2024-03-01")
        assert result == [("2024-02-01", 102.0), ("2024-03-01", 105.0)]

    def test_no_end_returns_all_after_start(self) -> None:
        points = [("2024-01-01", 1.0), ("2024-02-01", 2.0), ("2024-03-01", 3.0)]
        result = slice_oos_segment(points, "2024-02-01", "")
        assert result == [("2024-02-01", 2.0), ("2024-03-01", 3.0)]


class TestInterpolateWindowCurve:
    def test_invalid_dates_returns_empty(self) -> None:
        assert interpolate_window_curve("", "2024-12-31", 5.0, 100.0) == ([], [])
        assert interpolate_window_curve("not-a-date", "2024-12-31", 5.0, 100.0) == ([], [])

    def test_negative_period_returns_empty(self) -> None:
        # end < start
        assert interpolate_window_curve("2024-12-31", "2024-01-01", 5.0, 100.0) == ([], [])

    def test_linear_interpolation(self) -> None:
        # 2024-01-01 から 2024-01-05 まで 5 日間で +10% リターン
        dates, values = interpolate_window_curve(
            "2024-01-01", "2024-01-05", 10.0, 100.0
        )
        assert len(dates) == 5
        assert dates[0] == "2024-01-01"
        assert dates[-1] == "2024-01-05"
        assert values[0] == pytest.approx(100.0)
        assert values[-1] == pytest.approx(110.0)
        # 中間点が線形になっている
        assert values[2] == pytest.approx(105.0)


class TestExtractCompositeCurve:
    def _windows(self) -> list[dict[str, Any]]:
        return [
            {
                "oos_start": "2024-02-01",
                "oos_end": "2024-02-03",
                "oos_return": 5.0,
            },
            {
                "oos_start": "2024-03-01",
                "oos_end": "2024-03-03",
                "oos_return": -2.0,
            },
        ]

    def test_no_windows_returns_empty(self) -> None:
        equity, dates = extract_composite_curve([], lambda _: None)
        assert equity == []
        assert dates == []

    def test_uses_fetch_callable_when_curve_available(self) -> None:
        # window 1 のみ実 equity を返す callable
        curve_json = json.dumps(
            [
                {"date": "2024-02-01", "value": 200.0},
                {"date": "2024-02-02", "value": 210.0},
                {"date": "2024-02-03", "value": 220.0},
            ]
        )
        called: list[str] = []

        def fetch(oos_start: str) -> str | None:
            called.append(oos_start)
            return curve_json if oos_start == "2024-02-01" else None

        equity, dates = extract_composite_curve(self._windows(), fetch)
        assert called == ["2024-02-01", "2024-03-01"]
        assert dates[0] == "2024-02-01"
        assert equity[0] == pytest.approx(100.0)  # 先頭は anchor

    def test_falls_back_to_interpolation_on_missing_curve(self) -> None:
        equity, dates = extract_composite_curve(self._windows(), lambda _: None)
        # 両 window が線形補間されるため空にならない
        assert len(equity) > 0
        assert dates[0] == "2024-02-01"

    def test_callable_exception_falls_back_silently(self) -> None:
        def fetch(_: str) -> str | None:
            raise RuntimeError("DB down")

        # 例外でも線形補間で fallback するため空にならない
        equity, dates = extract_composite_curve(self._windows(), fetch)
        assert len(equity) > 0

    def test_sorts_by_oos_start(self) -> None:
        # 入力順が逆でも oos_start 昇順で処理される
        windows = [
            {"oos_start": "2024-03-01", "oos_end": "2024-03-03", "oos_return": -2.0},
            {"oos_start": "2024-02-01", "oos_end": "2024-02-03", "oos_return": 5.0},
        ]
        _, dates = extract_composite_curve(windows, lambda _: None)
        assert dates[0] == "2024-02-01"
