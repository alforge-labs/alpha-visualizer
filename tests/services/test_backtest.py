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


class TestShapeTradesExitSlTpPrice:
    """shape_trades の exit_price / sl_price / tp_price 透過テスト（issue #189）"""

    def test_pickup_exit_sl_tp_when_present(self) -> None:
        """alpha-forge 側が値を出していれば pickup される"""
        raw = [
            {
                "id": 0,
                "direction": "long",
                "entry_price": 100.0,
                "exit_price": 110.0,
                "sl_price": 98.0,
                "tp_price": 115.0,
                "return_pct": 10.0,
                "pnl": 1000.0,
                "holding_days": 5,
            }
        ]
        out = bt.shape_trades(raw, None)
        assert len(out) == 1
        assert out[0]["exit_price"] == 110.0
        assert out[0]["sl_price"] == 98.0
        assert out[0]["tp_price"] == 115.0

    def test_default_none_when_missing(self) -> None:
        """alpha-forge 側に該当キーがなければ None を返す"""
        raw = [
            {
                "id": 0,
                "direction": "long",
                "entry_price": 100.0,
                "return_pct": 10.0,
                "pnl": 1000.0,
                "holding_days": 5,
            }
        ]
        out = bt.shape_trades(raw, None)
        assert out[0]["exit_price"] is None
        assert out[0]["sl_price"] is None
        assert out[0]["tp_price"] is None

    def test_nan_value_becomes_none(self) -> None:
        """NaN 値は None に変換される"""
        import math
        raw = [
            {
                "id": 0,
                "direction": "long",
                "entry_price": 100.0,
                "exit_price": math.nan,
                "return_pct": 0.0,
                "pnl": 0.0,
                "holding_days": 1,
            }
        ]
        out = bt.shape_trades(raw, None)
        assert out[0]["exit_price"] is None

    def test_invalid_value_becomes_none(self) -> None:
        """数値化できない値は None に変換される"""
        raw = [
            {
                "id": 0,
                "direction": "long",
                "entry_price": 100.0,
                "exit_price": "not-a-number",
                "return_pct": 0.0,
                "pnl": 0.0,
                "holding_days": 1,
            }
        ]
        out = bt.shape_trades(raw, None)
        assert out[0]["exit_price"] is None


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

    def test_prefers_metrics_json_trades_over_trades_json(self) -> None:
        """metrics_json.trades (snake_case) が存在すれば trades_json (legacy) より優先する。

        alpha-forge の `_calc_trade_list` 出力は metrics_json.trades に入っており、
        ここに sl_price / tp_price も含まれる（#189/#191 で frontend が利用）。
        backtest_results.trades_json 列は vectorbt records_readable の
        PascalCase で alpha-visualizer の `shape_trades` が認識できないため、
        snake_case を持つ metrics_json.trades を優先する。
        """
        snake_trades = [
            {
                "id": 0,
                "direction": "long",
                "entry_date": "2024-01-02",
                "entry_price": 100.0,
                "exit_date": "2024-01-10",
                "exit_price": 110.0,
                "sl_price": 98.0,
                "tp_price": 115.0,
                "return_pct": 10.0,
                "pnl": 1000.0,
                "holding_days": 8,
            }
        ]
        legacy_pascal = [
            {"Avg Entry Price": 100.0, "Avg Exit Price": 110.0, "Direction": "Long"}
        ]
        row = _make_row(
            metrics_json=json.dumps({"trades": snake_trades, "sharpe_ratio": 1.5}),
            trades_json=json.dumps(legacy_pascal),
        )
        rec = bt.row_to_dict(row)
        assert rec["trades"] == snake_trades
        assert rec["trades"][0]["sl_price"] == 98.0

    def test_falls_back_to_trades_json_when_metrics_has_no_trades(self) -> None:
        """metrics_json に trades が無ければ trades_json をフォールバックで読む（後方互換）。"""
        legacy_pascal = [
            {"Avg Entry Price": 100.0, "Avg Exit Price": 110.0, "Direction": "Long"}
        ]
        row = _make_row(
            metrics_json=json.dumps({"sharpe_ratio": 1.5}),
            trades_json=json.dumps(legacy_pascal),
        )
        rec = bt.row_to_dict(row)
        assert rec["trades"] == legacy_pascal

    def test_both_empty_returns_empty_trades(self) -> None:
        row = _make_row(metrics_json=json.dumps({}), trades_json=None)
        rec = bt.row_to_dict(row)
        assert rec["trades"] == []

    def test_metrics_json_empty_trades_list_falls_back(self) -> None:
        """metrics_json.trades が空 list の場合は trades_json をフォールバック。"""
        legacy = [{"Avg Entry Price": 100.0}]
        row = _make_row(
            metrics_json=json.dumps({"trades": []}),
            trades_json=json.dumps(legacy),
        )
        rec = bt.row_to_dict(row)
        assert rec["trades"] == legacy


class TestCarryAdjusted:
    """carry_adjusted_json のパースと詳細レスポンスへの透過（vis#308）。

    WHY: forge の `backtest run --carry` が保存した {"metrics", "note"} を
    Backtest 詳細で price-only と対比表示するため。無いラン（NULL）は None の
    まま透過し、「キー有無 = キャリー計上有無」の契約をレスポンスでも保つ。
    """

    _CARRY = {
        "metrics": {"total_return_pct": 12.3, "sharpe_ratio": 1.35},
        "note": "金利差近似の参考値",
    }

    def test_row_to_dictがcarry_adjusted_jsonをパースする(self) -> None:
        row = _make_row(carry_adjusted_json=json.dumps(self._CARRY, ensure_ascii=False))
        d = bt.row_to_dict(row)
        assert d["carry_adjusted"] == self._CARRY

    def test_carry無し行はnoneで透過する(self) -> None:
        d = bt.row_to_dict(_make_row())
        assert d["carry_adjusted"] is None

    def test_壊れたjsonはnoneにして継続する(self) -> None:
        # 読み取り専用ビューアとして 1 行の破損で 500 にしない（trades_json と同じ扱い）
        row = _make_row(carry_adjusted_json="{broken")
        d = bt.row_to_dict(row)
        assert d["carry_adjusted"] is None

    def test_build_detailにcarry_adjustedが載る(self) -> None:
        row = _make_row(carry_adjusted_json=json.dumps(self._CARRY, ensure_ascii=False))
        detail = bt.build_detail(row)
        assert detail["carry_adjusted"] == self._CARRY

    def test_build_detailでcarry無しはnone(self) -> None:
        detail = bt.build_detail(_make_row())
        assert detail["carry_adjusted"] is None
