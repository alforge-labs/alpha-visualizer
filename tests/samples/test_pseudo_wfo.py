"""WFO 擬似生成器の単体テスト。

- 2 件の登録ペアそれぞれ 6 ウィンドウ
- 各ウィンドウが is/oos_sharpe・date 範囲・params・pass を含む
- 安定ペア (EQUITY SMA) は全 pass、不安定ペア (CRYPTO Supertrend) は pass<6
- 決定論性
"""

from __future__ import annotations

import pandas as pd
import pytest

from samples._generators.pseudo_wfo import (
    WFO_PAIRS,
    WFORun,
    build_all_wfo,
    generate_wfo_run,
)
from samples._generators.synthetic_ohlcv import build_all

REQUIRED_WINDOW_KEYS: frozenset[str] = frozenset(
    {
        "window_id",
        "label",
        "is_start",
        "is_end",
        "oos_start",
        "oos_end",
        "is_sharpe",
        "oos_sharpe",
        "is_return_pct",
        "oos_return_pct",
        "params",
        "pass",
    }
)


@pytest.fixture(scope="module")
def ohlcv() -> dict[str, pd.DataFrame]:
    return build_all()


@pytest.fixture(scope="module")
def wfo_runs(ohlcv: dict[str, pd.DataFrame]) -> list[WFORun]:
    return build_all_wfo(ohlcv)


def test_wfo_pairs_count() -> None:
    assert len(WFO_PAIRS) == 2


def test_build_all_wfo_returns_two_runs(wfo_runs: list[WFORun]) -> None:
    assert len(wfo_runs) == 2


def test_run_ids_are_wfo_prefixed(wfo_runs: list[WFORun]) -> None:
    for r in wfo_runs:
        assert r.run_id.startswith("wfo_")
        assert r.run_id == f"wfo_{r.strategy_id}_{r.symbol}_001"


def test_each_run_has_six_windows(wfo_runs: list[WFORun]) -> None:
    for r in wfo_runs:
        assert r.n_trials == 6
        assert len(r.all_trials) == 6


def test_windows_have_required_keys(wfo_runs: list[WFORun]) -> None:
    for r in wfo_runs:
        for window in r.all_trials:
            missing = REQUIRED_WINDOW_KEYS - window.keys()
            assert not missing, f"{r.run_id}: missing keys {missing}"


def test_windows_are_chronologically_ordered(wfo_runs: list[WFORun]) -> None:
    for r in wfo_runs:
        is_starts = [w["is_start"] for w in r.all_trials]
        assert is_starts == sorted(is_starts), f"{r.run_id}: windows not in order"


def test_is_before_oos_within_window(wfo_runs: list[WFORun]) -> None:
    for r in wfo_runs:
        for w in r.all_trials:
            assert w["is_end"] < w["oos_start"]
            assert w["oos_start"] <= w["oos_end"]


def test_pass_flag_consistent_with_oos_sharpe(wfo_runs: list[WFORun]) -> None:
    for r in wfo_runs:
        for w in r.all_trials:
            assert w["pass"] is (w["oos_sharpe"] > 0.5)


def test_stable_pair_all_pass(wfo_runs: list[WFORun]) -> None:
    """EQUITY × SMA は「安定」のストーリーとして全ウィンドウで pass する想定。"""
    stable = next(
        r for r in wfo_runs
        if r.strategy_id == "sma_crossover_v1" and r.symbol == "EQUITY_SYNTH"
    )
    pass_count = sum(1 for w in stable.all_trials if w["pass"])
    assert pass_count == 6, "stable pair should pass all 6 windows"


def test_unstable_pair_has_some_failure(wfo_runs: list[WFORun]) -> None:
    """CRYPTO × Supertrend は乖離大の「不安定」ストーリー（pass < 6）。"""
    unstable = next(
        r for r in wfo_runs
        if r.strategy_id == "supertrend_adx_v1" and r.symbol == "CRYPTO_SYNTH"
    )
    pass_count = sum(1 for w in unstable.all_trials if w["pass"])
    assert pass_count < 6, "unstable pair should have at least one failing window"


def test_determinism(ohlcv: dict[str, pd.DataFrame]) -> None:
    a = build_all_wfo(ohlcv)
    b = build_all_wfo(ohlcv)
    assert len(a) == len(b)
    for x, y in zip(a, b, strict=True):
        assert x.run_id == y.run_id
        assert x.all_trials == y.all_trials
        assert x.best_params == y.best_params
        assert x.best_metric_value == y.best_metric_value


def test_unknown_pair_raises_key_error(ohlcv: dict[str, pd.DataFrame]) -> None:
    with pytest.raises(KeyError):
        generate_wfo_run("rsi_reversion_v1", "FX_SYNTH", ohlcv["FX_SYNTH"])
