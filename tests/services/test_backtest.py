"""``services/backtest.py`` の単体テスト。

routers から切り出した純関数群が、移動前と同じセマンティクスで
動作することを検証する（API 互換性のリグレッション防止）。
"""
from __future__ import annotations

import json
from datetime import datetime

import pytest

from alpha_visualizer.repositories.backtest_results import BacktestResultRow
from alpha_visualizer.services import backtest as bt


def _make_row(**overrides: object) -> BacktestResultRow:
    """テスト用の ``BacktestResultRow`` を生成するヘルパ。"""
    base: dict[str, object] = {
        "run_id": "r1",
        "strategy_id": "sma",
        "symbol": "SPY",
        "run_at": "2024-01-01T00:00:00",
        "total_return_pct": 10.0,
        "cagr_pct": 8.0,
        "sharpe_ratio": 1.2,
        "sortino_ratio": None,
        "calmar_ratio": None,
        "max_drawdown_pct": -5.0,
        "total_trades": 20,
        "win_rate_pct": None,
        "profit_factor": None,
        "avg_holding_days": None,
        "metrics_json": None,
        "equity_curve_json": None,
        "buy_hold_curve_json": None,
        "trades_json": None,
        "oos_start": None,
    }
    base.update(overrides)
    return BacktestResultRow(**base)  # type: ignore[arg-type]


class TestParseDt:
    def test_iso_string(self) -> None:
        assert bt.parse_dt("2024-01-15T12:30:00") == datetime(2024, 1, 15, 12, 30, 0)

    def test_with_z_suffix_strips_tz(self) -> None:
        # +00:00 / Z 付きでも naive datetime を返すこと
        result = bt.parse_dt("2024-01-15T12:30:00Z")
        assert result == datetime(2024, 1, 15, 12, 30, 0)
        assert result.tzinfo is None

    def test_invalid_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            bt.parse_dt("not-a-date")


class TestComputeDrawdown:
    def test_simple_series(self) -> None:
        values = [1.0, 1.2, 0.96, 1.5]
        dd = bt.compute_drawdown(values)
        assert len(dd) == 4
        # 初値はピーク → drawdown 0
        assert dd[0] == pytest.approx(0.0)
        # 1.2 がピーク、0.96/1.2-1 = -20%
        assert dd[2] == pytest.approx(-20.0, abs=1e-6)
        # 1.5 が新たなピーク → 0
        assert dd[3] == pytest.approx(0.0)

    def test_empty(self) -> None:
        assert bt.compute_drawdown([]) == []


class TestComputeDailyReturns:
    def test_simple_series(self) -> None:
        values = [100.0, 105.0, 100.0]
        rets = bt.compute_daily_returns(values)
        assert len(rets) == 2
        assert rets[0] == pytest.approx(5.0)
        # 100/105 - 1 = -4.7619%
        assert rets[1] == pytest.approx(-4.761905, abs=1e-5)

    def test_too_short(self) -> None:
        assert bt.compute_daily_returns([]) == []
        assert bt.compute_daily_returns([1.0]) == []

    def test_zero_prev_yields_zero(self) -> None:
        # prev が 0 の場合は 0.0 を返す（既存挙動）
        rets = bt.compute_daily_returns([0.0, 1.0])
        assert rets == [0.0]


class TestShapeEquity:
    def test_dict_items(self) -> None:
        raw = [
            {"date": "2024-01-01", "value": 1.0},
            {"date": "2024-01-02", "value": 1.05},
        ]
        dates, values = bt.shape_equity(raw)
        assert dates == ["2024-01-01", "2024-01-02"]
        assert values == pytest.approx([1.0, 1.05])

    def test_scalar_items(self) -> None:
        # 数値スカラーが渡された場合は date は空文字
        dates, values = bt.shape_equity([1.0, 2.0, 3.0])
        assert values == pytest.approx([1.0, 2.0, 3.0])
        assert dates == ["", "", ""]

    def test_empty(self) -> None:
        assert bt.shape_equity(None) == ([], [])
        assert bt.shape_equity([]) == ([], [])


class TestIsCutoff:
    def test_returns_dict_with_date_and_index(self) -> None:
        dates = ["2024-01-01", "2024-06-01", "2024-12-01"]
        result = bt.is_cutoff(dates, "2024-06-01")
        assert isinstance(result, dict)
        assert set(result.keys()) == {"date", "index"}
        # 2024-06-01 は index 1 にヒット → cutoff index は 1、prev は dates[0]
        assert result["index"] == 1
        assert result["date"] == "2024-01-01"

    def test_no_oos_start_returns_neg_one(self) -> None:
        result = bt.is_cutoff(["2024-01-01"], None)
        assert result == {"date": None, "index": -1}

    def test_oos_after_all_dates(self) -> None:
        dates = ["2024-01-01", "2024-02-01"]
        result = bt.is_cutoff(dates, "2025-01-01")
        # ループで一致せずに最後まで来た場合は末尾と len を返す
        assert result["index"] == len(dates)
        assert result["date"] == dates[-1]


class TestShapeAnnualReturns:
    def test_typical_input(self) -> None:
        out = bt.shape_annual_returns({"2023": 12.5, "2024": -3.2})
        assert out == {2023: 12.5, 2024: -3.2}

    def test_skips_invalid_year(self) -> None:
        out = bt.shape_annual_returns({"abc": 1.0, "2024": 5.0})
        assert out == {2024: 5.0}

    def test_empty(self) -> None:
        assert bt.shape_annual_returns(None) == {}
        assert bt.shape_annual_returns({}) == {}


class TestShapeMonthlyReturns:
    def test_groups_by_year_with_12_slots(self) -> None:
        out = bt.shape_monthly_returns({"2024-01": 1.0, "2024-12": 2.0})
        assert 2024 in out
        assert len(out[2024]) == 12
        assert out[2024][0] == 1.0
        assert out[2024][11] == 2.0
        # 未指定月は None
        assert out[2024][5] is None

    def test_invalid_month_skipped(self) -> None:
        out = bt.shape_monthly_returns({"2024-13": 1.0, "2024-01": 2.0})
        assert out[2024][0] == 2.0


class TestSummarizeRow:
    def test_keys_are_exactly_eight(self) -> None:
        row = _make_row()
        summary = bt.summarize_row(row)
        expected = {
            "run_id",
            "strategy_id",
            "symbol",
            "run_at",
            "sharpe_ratio",
            "total_return_pct",
            "max_drawdown_pct",
            "total_trades",
        }
        assert set(summary.keys()) == expected

    def test_values_passthrough(self) -> None:
        row = _make_row(
            run_id="abc",
            strategy_id="sma",
            symbol="QQQ",
            sharpe_ratio=2.5,
            total_trades=42,
        )
        summary = bt.summarize_row(row)
        assert summary["run_id"] == "abc"
        assert summary["strategy_id"] == "sma"
        assert summary["symbol"] == "QQQ"
        assert summary["sharpe_ratio"] == 2.5
        assert summary["total_trades"] == 42


class TestBuildDetail:
    def test_returns_dict_with_required_keys(self) -> None:
        row = _make_row(
            metrics_json=json.dumps({"sharpe_ratio": 1.2}),
            equity_curve_json=json.dumps([
                {"date": "2024-01-01", "value": 1.0},
                {"date": "2024-01-02", "value": 1.1},
            ]),
            trades_json=json.dumps([]),
        )
        detail = bt.build_detail(row)
        assert isinstance(detail, dict)
        # 詳細レスポンスとして最低限の構造を含むこと
        for key in (
            "run_id",
            "strategy_id",
            "symbol",
            "timeframe",
            "period",
            "equity",
            "drawdown",
            "daily_returns",
            "metrics",
            "trades",
        ):
            assert key in detail, f"missing key: {key}"
        assert detail["run_id"] == "r1"
        assert detail["equity"]["dates"] == ["2024-01-01", "2024-01-02"]
        assert detail["equity"]["values"] == pytest.approx([1.0, 1.1])

    def test_empty_metrics_and_curve(self) -> None:
        # JSON 列が None でもエラーにならず、空構造を返すこと
        row = _make_row()
        detail = bt.build_detail(row)
        assert detail["equity"] == {"dates": [], "values": []}
        assert detail["drawdown"] == []
        assert detail["trades"] == []


class TestFilterBySince:
    def test_none_since_returns_all(self) -> None:
        rows = [_make_row(run_id="a", run_at="2024-01-01T00:00:00")]
        assert bt.filter_by_since(rows, None) == rows

    def test_filters_older_rows(self) -> None:
        rows = [
            _make_row(run_id="old", run_at="2024-01-01T00:00:00"),
            _make_row(run_id="new", run_at="2024-06-01T00:00:00"),
        ]
        out = bt.filter_by_since(rows, datetime(2024, 3, 1))
        ids = {r.run_id for r in out}
        assert "old" not in ids
        assert "new" in ids

    def test_unparseable_run_at_kept(self) -> None:
        # 既存挙動: パース不能な run_at は除外せず残す
        rows = [_make_row(run_id="bad", run_at="not-a-date")]
        out = bt.filter_by_since(rows, datetime(2024, 1, 1))
        assert [r.run_id for r in out] == ["bad"]


class TestRowToDict:
    def test_merges_top_level_columns_into_metrics(self) -> None:
        row = _make_row(
            metrics_json=json.dumps({"custom_metric": 99}),
            sharpe_ratio=1.5,
            total_trades=10,
        )
        rec = bt.row_to_dict(row)
        # 既存の metrics に DB トップレベルカラムがマージされていること
        assert rec["metrics"]["custom_metric"] == 99
        assert rec["metrics"]["sharpe_ratio"] == 1.5
        assert rec["metrics"]["total_trades"] == 10
        # トップレベルにも残っていること
        assert rec["sharpe_ratio"] == 1.5

    def test_invalid_json_falls_back_to_empty(self) -> None:
        row = _make_row(metrics_json="not-json", equity_curve_json="{broken")
        rec = bt.row_to_dict(row)
        # JSON デコード失敗時はトップレベルカラムが merge された dict になる
        assert isinstance(rec["metrics"], dict)
        assert rec["equity_curve"] == []
