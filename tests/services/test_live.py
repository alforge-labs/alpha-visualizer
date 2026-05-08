"""``services.live`` 純関数のユニットテスト。"""

from __future__ import annotations

import pytest

from alpha_visualizer.services.live import (
    DIFF_METRICS,
    aligned_aggregates,
    compute_diff,
    date_in_period,
    diff_value,
    normalize_trade,
    optional_float,
    safe_float,
    trade_period,
)


class TestSafeFloat:
    def test_valid_number(self) -> None:
        assert safe_float(1.5) == 1.5
        assert safe_float("3.14") == 3.14

    def test_invalid_returns_zero(self) -> None:
        assert safe_float(None) == 0.0
        assert safe_float("abc") == 0.0
        assert safe_float(float("inf")) == 0.0
        assert safe_float(float("nan")) == 0.0


class TestOptionalFloat:
    def test_valid_number(self) -> None:
        assert optional_float(1.5) == 1.5
        assert optional_float("3.14") == 3.14

    def test_none_passes_through(self) -> None:
        assert optional_float(None) is None

    def test_invalid_returns_none(self) -> None:
        assert optional_float("abc") is None
        assert optional_float(float("inf")) is None
        assert optional_float(float("nan")) is None


class TestNormalizeTrade:
    def test_returns_none_when_required_missing(self) -> None:
        assert normalize_trade({}) is None
        assert normalize_trade({"entry_at": "2026-04-01"}) is None
        assert normalize_trade({"exit_at": "2026-04-01"}) is None

    def test_normalizes_full_trade(self) -> None:
        raw = {
            "trade_id": "t1",
            "symbol": "AAPL",
            "side": "long",
            "entry_at": "2026-04-01T10:00:00",
            "exit_at": "2026-04-02T15:00:00",
            "qty": 100,
            "entry_price": 150.0,
            "exit_price": 155.0,
            "net_pnl": 500.0,
            "return_pct": 3.33,
        }
        result = normalize_trade(raw)
        assert result is not None
        assert result["trade_id"] == "t1"
        assert result["side"] == "long"
        assert result["qty"] == 100.0
        assert result["return_pct"] == pytest.approx(3.33)

    def test_falls_back_to_legacy_keys(self) -> None:
        raw = {
            "id": "legacy",
            "entry_date": "2026-04-01",
            "exit_date": "2026-04-02",
            "direction": "short",
            "pnl": 100.0,
        }
        result = normalize_trade(raw)
        assert result is not None
        assert result["trade_id"] == "legacy"
        assert result["side"] == "short"
        assert result["entry_at"] == "2026-04-01"
        assert result["net_pnl"] == 100.0

    def test_side_unknown_defaults_short_when_not_long(self) -> None:
        raw = {
            "entry_at": "2026-04-01",
            "exit_at": "2026-04-02",
            "side": "unknown",
        }
        result = normalize_trade(raw)
        assert result is not None
        assert result["side"] == "short"


class TestTradePeriod:
    def test_empty_returns_none(self) -> None:
        assert trade_period([]) is None

    def test_extracts_min_max(self) -> None:
        trades = [
            {"entry_at": "2026-04-01", "exit_at": "2026-04-02"},
            {"entry_at": "2026-03-15", "exit_at": "2026-04-05"},
            {"entry_at": "2026-04-03", "exit_at": "2026-04-04"},
        ]
        result = trade_period(trades)
        assert result == {"start": "2026-03-15", "end": "2026-04-05"}

    def test_returns_none_when_keys_missing(self) -> None:
        # entry_at が無いものだけのリスト
        assert trade_period([{"exit_at": "2026-04-02"}]) is None


class TestDateInPeriod:
    def _period(self) -> dict[str, str]:
        return {"start": "2026-03-15", "end": "2026-04-05"}

    def test_inside_period(self) -> None:
        assert date_in_period("2026-04-01", self._period()) is True

    def test_boundaries_inclusive(self) -> None:
        assert date_in_period("2026-03-15", self._period()) is True
        assert date_in_period("2026-04-05", self._period()) is True

    def test_outside_period(self) -> None:
        assert date_in_period("2026-03-14", self._period()) is False
        assert date_in_period("2026-04-06", self._period()) is False

    def test_empty_returns_false(self) -> None:
        assert date_in_period("", self._period()) is False


class TestAlignedAggregates:
    def _period(self) -> dict[str, str]:
        return {"start": "2026-04-01", "end": "2026-04-30"}

    def test_empty_returns_none(self) -> None:
        assert aligned_aggregates([], self._period()) is None

    def test_no_match_returns_none(self) -> None:
        # period 外
        trades = [{"exit_date": "2026-05-15", "return_pct": 1.0, "pnl": 50}]
        assert aligned_aggregates(trades, self._period()) is None

    def test_aggregates_within_period(self) -> None:
        trades = [
            {"exit_date": "2026-04-05", "return_pct": 2.0, "pnl": 100},
            {"exit_date": "2026-04-10", "return_pct": -1.0, "pnl": -50},
            {"exit_date": "2026-05-15", "return_pct": 5.0, "pnl": 200},  # 範囲外
        ]
        result = aligned_aggregates(trades, self._period())
        assert result is not None
        assert result["total_trades"] == 2
        assert result["win_rate_pct"] == 50.0
        assert result["profit_factor"] == 2.0  # gross_win 100 / |gross_loss 50|
        assert result["net_pnl"] == 50.0  # 100 + (-50)

    def test_no_losses_yields_zero_profit_factor(self) -> None:
        # 損失なし → divide-by-zero 回避
        trades = [{"exit_date": "2026-04-05", "return_pct": 2.0, "pnl": 100}]
        result = aligned_aggregates(trades, self._period())
        assert result is not None
        assert result["profit_factor"] == 0.0


class TestDiffValue:
    def test_normal(self) -> None:
        assert diff_value(10.0, 7.0) == 3.0

    def test_none_returns_none(self) -> None:
        assert diff_value(None, 7.0) is None
        assert diff_value(10.0, None) is None

    def test_invalid_returns_none(self) -> None:
        assert diff_value("abc", 7.0) is None


class TestComputeDiff:
    def test_aligned_none_returns_none(self) -> None:
        assert compute_diff({"total_trades": 5}, None) is None

    def test_full_diff(self) -> None:
        summary = {
            "total_trades": 10,
            "win_rate_pct": 60.0,
            "profit_factor": 2.0,
            "max_drawdown_pct": -5.0,
            "net_pnl": 1000.0,
        }
        aligned = {
            "total_trades": 8,
            "win_rate_pct": 50.0,
            "profit_factor": 1.5,
            "max_drawdown_pct": -7.0,
            "net_pnl": 800.0,
        }
        result = compute_diff(summary, aligned)
        assert result is not None
        assert result["total_trades"] == 2.0
        assert result["win_rate_pct"] == 10.0
        assert result["profit_factor"] == pytest.approx(0.5)
        assert result["max_drawdown_pct"] == 2.0
        assert result["net_pnl"] == 200.0

    def test_returns_none_when_all_unavailable(self) -> None:
        # summary 側に DIFF_METRICS の値が一切ない
        result = compute_diff({}, {"total_trades": None})
        assert result is None

    def test_diff_metrics_keys_constant(self) -> None:
        # 公開 API の安定性を担保する
        assert DIFF_METRICS == (
            "total_trades",
            "win_rate_pct",
            "profit_factor",
            "max_drawdown_pct",
            "net_pnl",
        )
