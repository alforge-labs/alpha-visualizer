"""Grid 最適化擬似生成器の単体テスト。

- RSI ペアは 5×8=40 trial、BBands ペアは 7×6=42 trial
- best_params が peak で一致（二次関数のピーク再現）
- metric_value の分布が想定レンジ（フロントヒートマップでグラデーション表示できる）
- 決定論性
"""

from __future__ import annotations

import pandas as pd
import pytest

from samples._generators.pseudo_grid import (
    GRID_PAIRS,
    GridRun,
    build_all_grid,
    generate_grid_run,
)
from samples._generators.synthetic_ohlcv import build_all

REQUIRED_TRIAL_KEYS: frozenset[str] = frozenset({"trial", "params", "metric_value"})


@pytest.fixture(scope="module")
def ohlcv() -> dict[str, pd.DataFrame]:
    return build_all()


@pytest.fixture(scope="module")
def grid_runs(ohlcv: dict[str, pd.DataFrame]) -> list[GridRun]:
    return build_all_grid(ohlcv)


def test_grid_pairs_count() -> None:
    assert len(GRID_PAIRS) == 2


def test_build_all_grid_returns_two_runs(grid_runs: list[GridRun]) -> None:
    assert len(grid_runs) == 2


def test_run_ids_are_opt_prefixed(grid_runs: list[GridRun]) -> None:
    for r in grid_runs:
        assert r.run_id.startswith("opt_")
        assert r.run_id == f"opt_{r.strategy_id}_{r.symbol}_001"


def test_rsi_grid_has_forty_trials(grid_runs: list[GridRun]) -> None:
    rsi = next(
        r for r in grid_runs
        if r.strategy_id == "rsi_reversion_v1" and r.symbol == "INDEX_SYNTH"
    )
    assert rsi.n_trials == 40
    assert len(rsi.all_trials) == 40


def test_bbands_grid_has_forty_two_trials(grid_runs: list[GridRun]) -> None:
    bb = next(
        r for r in grid_runs
        if r.strategy_id == "bbands_breakout_v1" and r.symbol == "COMMODITY_SYNTH"
    )
    assert bb.n_trials == 42
    assert len(bb.all_trials) == 42


def test_trials_have_required_keys(grid_runs: list[GridRun]) -> None:
    for r in grid_runs:
        for t in r.all_trials:
            missing = REQUIRED_TRIAL_KEYS - t.keys()
            assert not missing, f"{r.run_id}: missing keys {missing}"


def test_best_params_is_at_or_near_peak(grid_runs: list[GridRun]) -> None:
    """ノイズはあるが best は理想ピーク付近に来るはず。"""
    rsi = next(
        r for r in grid_runs
        if r.strategy_id == "rsi_reversion_v1" and r.symbol == "INDEX_SYNTH"
    )
    assert abs(int(rsi.best_params["rsi_length"]) - 14) <= 4
    assert abs(int(rsi.best_params["oversold"]) - 30) <= 5

    bb = next(
        r for r in grid_runs
        if r.strategy_id == "bbands_breakout_v1" and r.symbol == "COMMODITY_SYNTH"
    )
    assert abs(int(bb.best_params["bb_length"]) - 20) <= 5
    assert abs(float(bb.best_params["bb_std"]) - 2.0) <= 0.3


def test_metric_distribution_for_heatmap(grid_runs: list[GridRun]) -> None:
    """グラデーション表示しやすいよう、min と max の差が 1.5 以上あること。"""
    for r in grid_runs:
        values = [float(t["metric_value"]) for t in r.all_trials]
        assert max(values) - min(values) > 1.5, (
            f"{r.run_id}: metric spread {max(values) - min(values):.2f} too narrow"
        )
        # 中心値 1.4 付近で best が出る
        assert max(values) > 1.0


def test_determinism(ohlcv: dict[str, pd.DataFrame]) -> None:
    a = build_all_grid(ohlcv)
    b = build_all_grid(ohlcv)
    for x, y in zip(a, b, strict=True):
        assert x.run_id == y.run_id
        assert x.all_trials == y.all_trials
        assert x.best_params == y.best_params
        assert x.best_metric_value == y.best_metric_value


def test_unknown_pair_raises_key_error(ohlcv: dict[str, pd.DataFrame]) -> None:
    with pytest.raises(KeyError):
        generate_grid_run("sma_crossover_v1", "FX_SYNTH", ohlcv["FX_SYNTH"])
