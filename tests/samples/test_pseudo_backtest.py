"""擬似バックテスト生成器の単体テスト。

- 40 ラン全カバー（戦略 × 銘柄）
- equity_curve が ``N_BUSINESS_DAYS`` 点で日付フォーマット OK
- metrics が必須キーを持ち、Sharpe / MDD / win_rate の分布が想定レンジ
- 同じ入力に対して同じ出力（決定論性）
- run_id の命名規約・OOS start が中央付近
"""

from __future__ import annotations

import pandas as pd
import pytest

from samples._generators.compatibility_matrix import (
    SKILL_MATRIX,
    assert_full_coverage,
)
from samples._generators.pseudo_backtest import (
    INITIAL_EQUITY,
    BacktestRun,
    build_all_runs,
    generate_run,
)
from samples._generators.strategy_defs import list_ids
from samples._generators.synthetic_ohlcv import N_BUSINESS_DAYS, SYMBOL_REGIMES, build_all

REQUIRED_METRIC_KEYS: tuple[str, ...] = (
    "total_return_pct",
    "cagr_pct",
    "sharpe_ratio",
    "sortino_ratio",
    "calmar_ratio",
    "max_drawdown_pct",
    "win_rate_pct",
    "profit_factor",
    "total_trades",
    "avg_holding_days",
    "monthly_returns",
    "annual_returns",
)


@pytest.fixture(scope="module")
def ohlcv() -> dict[str, pd.DataFrame]:
    return build_all()


@pytest.fixture(scope="module")
def all_runs(ohlcv: dict[str, pd.DataFrame]) -> list[BacktestRun]:
    return build_all_runs(ohlcv)


def test_compatibility_matrix_full_coverage() -> None:
    assert_full_coverage()


def test_skill_matrix_size() -> None:
    assert len(SKILL_MATRIX) == 40


def test_total_runs_is_forty(all_runs: list[BacktestRun]) -> None:
    assert len(all_runs) == 40


def test_runs_cover_all_strategy_symbol_pairs(all_runs: list[BacktestRun]) -> None:
    pairs = {(r.strategy_id, r.symbol) for r in all_runs}
    expected = {(sid, sym) for sid in list_ids() for sym in SYMBOL_REGIMES}
    assert pairs == expected


def test_run_id_naming_convention(all_runs: list[BacktestRun]) -> None:
    for r in all_runs:
        assert r.run_id == f"bt_{r.strategy_id}_{r.symbol}_001"


@pytest.mark.parametrize("strategy_id", list_ids())
@pytest.mark.parametrize("symbol", list(SYMBOL_REGIMES.keys()))
def test_equity_curve_length_and_format(
    strategy_id: str, symbol: str, ohlcv: dict[str, pd.DataFrame]
) -> None:
    run = generate_run(strategy_id, symbol, ohlcv[symbol])
    assert len(run.equity_curve) == N_BUSINESS_DAYS
    assert len(run.buy_hold_curve) == N_BUSINESS_DAYS
    first = run.equity_curve[0]
    last = run.equity_curve[-1]
    assert set(first.keys()) == {"date", "value"}
    assert isinstance(first["date"], str) and len(first["date"]) == 10
    assert first["value"] > 0
    assert last["value"] > 0


def test_metrics_keys_present(all_runs: list[BacktestRun]) -> None:
    for r in all_runs:
        for key in REQUIRED_METRIC_KEYS:
            assert key in r.metrics, f"{r.run_id}: missing metric {key!r}"


def test_buy_hold_curve_starts_at_initial_equity(all_runs: list[BacktestRun]) -> None:
    for r in all_runs:
        assert r.buy_hold_curve[0]["value"] == pytest.approx(INITIAL_EQUITY)


def test_sharpe_distribution_spans_target_range(all_runs: list[BacktestRun]) -> None:
    sharpes = [r.metrics["sharpe_ratio"] for r in all_runs]
    assert min(sharpes) < -0.3, "no clearly losing strategies (need negative Sharpe)"
    assert max(sharpes) > 1.0, "no clearly winning strategies (need Sharpe > 1.0)"


def test_mdd_distribution_within_expected_range(all_runs: list[BacktestRun]) -> None:
    mdds = [r.metrics["max_drawdown_pct"] for r in all_runs]
    assert min(mdds) > -75.0, "MDD too deep for textbook strategies"
    assert max(mdds) < -5.0, "MDD too shallow — strategies should have meaningful drawdowns"


def test_return_distribution_spans_target_range(all_runs: list[BacktestRun]) -> None:
    returns = [r.metrics["total_return_pct"] for r in all_runs]
    assert min(returns) < -30.0, "no clearly losing strategies"
    assert max(returns) > 80.0, "no clearly winning strategies"


def test_win_rate_distribution_spans_target_range(all_runs: list[BacktestRun]) -> None:
    win_rates = [r.metrics["win_rate_pct"] for r in all_runs]
    assert min(win_rates) >= 30.0, "win rate too low"
    assert max(win_rates) <= 75.0, "win rate suspiciously high"
    assert max(win_rates) - min(win_rates) > 15.0, "win rate variance too narrow"


def test_trades_have_required_fields(all_runs: list[BacktestRun]) -> None:
    required = {
        "id",
        "direction",
        "entry_date",
        "exit_date",
        "entry_price",
        "exit_price",
        "return_pct",
        "pnl",
        "holding_days",
        "mae_pct",
        "mfe_pct",
    }
    for r in all_runs:
        assert len(r.trades) >= 1, f"{r.run_id}: no trades generated"
        for t in r.trades:
            assert required.issubset(t.keys()), (
                f"{r.run_id}: trade missing fields {required - t.keys()}"
            )


def test_oos_start_is_in_second_half(all_runs: list[BacktestRun]) -> None:
    for r in all_runs:
        midpoint_date = r.equity_curve[N_BUSINESS_DAYS // 2 - 1]["date"]
        assert r.oos_start >= midpoint_date


def test_determinism_full_runs(ohlcv: dict[str, pd.DataFrame]) -> None:
    runs1 = build_all_runs(ohlcv)
    runs2 = build_all_runs(ohlcv)
    for a, b in zip(runs1, runs2, strict=True):
        assert a.equity_curve == b.equity_curve, f"{a.run_id}: equity curve differs"
        assert a.trades == b.trades, f"{a.run_id}: trades differ"
        assert a.metrics == b.metrics, f"{a.run_id}: metrics differ"
        assert a.oos_start == b.oos_start
        assert a.run_at == b.run_at
