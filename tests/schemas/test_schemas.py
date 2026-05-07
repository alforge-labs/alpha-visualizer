"""Pydantic schema のテスト。

API レスポンスの型定義として正しく動作するか（必須/任意/extra="allow"）を検証する。
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from alpha_visualizer.schemas.ideas import Idea
from alpha_visualizer.schemas.optimize import OptimizeResult, OptimizeTrial
from alpha_visualizer.schemas.results import BacktestSummary
from alpha_visualizer.schemas.strategies import (
    EquityCurve,
    StrategyComparison,
    StrategySummary,
)
from alpha_visualizer.schemas.wfo import WFOResponse, WFOWindow

# --- Idea ----------------------------------------------------------------


def test_idea_accepts_minimal_dict() -> None:
    idea = Idea.model_validate({"idea_id": "i1", "status": "draft"})
    assert idea.idea_id == "i1"
    assert idea.status == "draft"


def test_idea_accepts_empty_dict() -> None:
    """すべて Optional のため空 dict も許容する。"""
    idea = Idea.model_validate({})
    assert idea.idea_id is None


def test_idea_allows_extra_fields() -> None:
    """extra="allow" により未知フィールドが透過することを確認する。"""
    idea = Idea.model_validate({"idea_id": "i1", "custom_field": "x"})
    assert idea.idea_id == "i1"
    # extra フィールドは model_dump() で再現される
    dumped = idea.model_dump()
    assert dumped["custom_field"] == "x"


# --- StrategySummary -----------------------------------------------------


def test_strategy_summary_requires_strategy_id_and_name() -> None:
    with pytest.raises(ValidationError):
        StrategySummary.model_validate({})
    with pytest.raises(ValidationError):
        StrategySummary.model_validate({"strategy_id": "x"})


def test_strategy_summary_minimal() -> None:
    s = StrategySummary.model_validate({"strategy_id": "x", "name": "X"})
    assert s.strategy_id == "x"
    assert s.name == "X"
    assert s.tags == []
    assert s.target_symbols == []
    assert s.latest_sharpe is None


def test_strategy_summary_with_latest_metrics() -> None:
    s = StrategySummary.model_validate(
        {
            "strategy_id": "x",
            "name": "X",
            "tags": ["a"],
            "target_symbols": ["AAPL"],
            "latest_sharpe": 1.5,
            "latest_total_trades": 42,
            "last_run_at": "2024-01-01T00:00:00",
        }
    )
    assert s.latest_sharpe == 1.5
    assert s.latest_total_trades == 42
    assert s.tags == ["a"]


# --- StrategyComparison --------------------------------------------------


def test_strategy_comparison_minimal() -> None:
    c = StrategyComparison.model_validate({"id": "x", "name": "X"})
    assert c.id == "x"
    assert c.equity.dates == []
    assert c.equity.values == []
    assert c.daily_returns == []


def test_strategy_comparison_with_equity() -> None:
    c = StrategyComparison.model_validate(
        {
            "id": "x",
            "name": "X",
            "symbol": "AAPL",
            "sharpe_ratio": 1.2,
            "is_baseline": True,
            "equity": {"dates": ["2024-01-01"], "values": [100.0]},
            "daily_returns": [0.5],
        }
    )
    assert c.symbol == "AAPL"
    assert c.is_baseline is True
    assert c.equity.dates == ["2024-01-01"]
    assert c.daily_returns == [0.5]


def test_equity_curve_defaults_to_empty() -> None:
    eq = EquityCurve.model_validate({})
    assert eq.dates == []
    assert eq.values == []


# --- BacktestSummary -----------------------------------------------------


def test_backtest_summary_requires_run_id() -> None:
    with pytest.raises(ValidationError):
        BacktestSummary.model_validate({"strategy_id": "x"})


def test_backtest_summary_minimal() -> None:
    s = BacktestSummary.model_validate({"run_id": "r1"})
    assert s.run_id == "r1"
    assert s.symbol is None


def test_backtest_summary_with_metrics() -> None:
    s = BacktestSummary.model_validate(
        {
            "run_id": "r1",
            "strategy_id": "s1",
            "symbol": "AAPL",
            "sharpe_ratio": 1.5,
            "total_trades": 100,
        }
    )
    assert s.sharpe_ratio == 1.5
    assert s.total_trades == 100


# --- WFO -----------------------------------------------------------------


def test_wfo_window_minimal() -> None:
    w = WFOWindow.model_validate({"id": 1})
    assert w.id == 1
    assert w.params == {}
    assert w.is_sharpe == 0.0


def test_wfo_window_pass_key_preserved_via_extra() -> None:
    """``pass`` キー（Python 予約語）は extra="allow" で透過される。"""
    w = WFOWindow.model_validate(
        {"id": 1, "pass": True, "is_sharpe": 1.5, "params": {"p1": 0.5}}
    )
    assert w.id == 1
    assert w.is_sharpe == 1.5
    dumped = w.model_dump()
    assert dumped["pass"] is True
    assert dumped["params"] == {"p1": 0.5}


def test_wfo_response_with_windows() -> None:
    response = WFOResponse.model_validate(
        {
            "strategy_id": "x",
            "windows": [{"id": 1, "label": "W1"}],
            "composite_equity": [100.0, 105.0],
            "composite_dates": ["2024-01-01", "2024-01-02"],
        }
    )
    assert response.strategy_id == "x"
    assert len(response.windows) == 1
    assert response.windows[0].id == 1
    assert response.composite_equity == [100.0, 105.0]


def test_wfo_response_minimal() -> None:
    response = WFOResponse.model_validate({"strategy_id": "x"})
    assert response.strategy_id == "x"
    assert response.windows == []
    assert response.composite_equity == []


# --- Optimize ------------------------------------------------------------


def test_optimize_trial_pass_key_preserved_via_extra() -> None:
    """``pass`` キーは extra="allow" で透過される。"""
    t = OptimizeTrial.model_validate(
        {
            "params": {"sma_fast": 10.0},
            "metric": 1.5,
            "pass": True,
            "metrics": {"sharpe_ratio": 1.5},
        }
    )
    assert t.metric == 1.5
    dumped = t.model_dump()
    assert dumped["pass"] is True


def test_optimize_result_minimal() -> None:
    r = OptimizeResult.model_validate({"strategy_id": "x"})
    assert r.strategy_id == "x"
    assert r.trials == []
    assert r.metric_name == "sharpe_ratio"


def test_optimize_result_with_trials() -> None:
    r = OptimizeResult.model_validate(
        {
            "strategy_id": "x",
            "run_at": "2024-01-01T00:00:00",
            "metric_name": "sharpe_ratio",
            "best_metric": 1.5,
            "trials": [
                {"params": {"p1": 1.0}, "metric": 1.5, "pass": True, "metrics": {}},
            ],
        }
    )
    assert r.best_metric == 1.5
    assert len(r.trials) == 1
    assert r.trials[0].params == {"p1": 1.0}
