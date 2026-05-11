"""8 戦略定義の検証。

- 8 件返る
- strategy_id が一意でファイル名と一致
- 必須フィールドが全戦略に揃っている
- target_symbols は _SYNTH 銘柄のみで構成される
- get() は deep copy を返す（呼び出し側の改変が原本に伝播しない）
"""

from __future__ import annotations

import pytest

from samples._generators.strategy_defs import (
    ALL_SYNTH_SYMBOLS,
    build_all,
    get,
    list_ids,
)

REQUIRED_FIELDS: tuple[str, ...] = (
    "strategy_id",
    "name",
    "version",
    "asset_type",
    "timeframe",
    "tags",
    "target_symbols",
    "description",
    "parameters",
    "indicators",
    "variables",
    "entry_conditions",
    "exit_conditions",
    "risk_management",
)


def test_build_all_returns_eight_strategies() -> None:
    payload = build_all()
    assert len(payload) == 8
    assert len(list_ids()) == 8


def test_strategy_ids_are_unique_and_match_keys() -> None:
    payload = build_all()
    for sid, definition in payload.items():
        assert definition["strategy_id"] == sid, f"{sid}: strategy_id mismatch"


def test_strategy_ids_use_versioned_convention() -> None:
    """alpha-forge の規約に合わせて _vN サフィックス必須。"""
    for sid in list_ids():
        assert sid.endswith("_v1"), f"{sid}: missing _v1 suffix"


@pytest.mark.parametrize("sid", list_ids())
def test_required_fields_present(sid: str) -> None:
    definition = get(sid)
    for field in REQUIRED_FIELDS:
        assert field in definition, f"{sid}: missing field {field!r}"


@pytest.mark.parametrize("sid", list_ids())
def test_target_symbols_subset_of_synth(sid: str) -> None:
    definition = get(sid)
    for symbol in definition["target_symbols"]:
        assert symbol in ALL_SYNTH_SYMBOLS, (
            f"{sid}: target_symbol {symbol!r} not in _SYNTH set"
        )


@pytest.mark.parametrize("sid", list_ids())
def test_indicators_have_name_and_type(sid: str) -> None:
    definition = get(sid)
    indicators = definition["indicators"]
    assert isinstance(indicators, list)
    assert len(indicators) >= 1
    for ind in indicators:
        assert "name" in ind and isinstance(ind["name"], str)
        assert "type" in ind and isinstance(ind["type"], str)
        assert "params" in ind and isinstance(ind["params"], dict)


@pytest.mark.parametrize("sid", list_ids())
def test_entry_and_exit_have_long_branch(sid: str) -> None:
    definition = get(sid)
    assert "long" in definition["entry_conditions"]
    assert "long" in definition["exit_conditions"]


@pytest.mark.parametrize("sid", list_ids())
def test_risk_management_has_positive_thresholds(sid: str) -> None:
    rm = get(sid)["risk_management"]
    assert rm["stop_loss_pct"] > 0
    assert rm["take_profit_pct"] > 0
    assert rm["take_profit_pct"] > rm["stop_loss_pct"], (
        f"{sid}: take_profit should be greater than stop_loss"
    )


def test_get_returns_deep_copy() -> None:
    a = get("sma_crossover_v1")
    a["parameters"]["fast_period"] = 999
    b = get("sma_crossover_v1")
    assert b["parameters"]["fast_period"] == 20, "deepcopy not effective"


def test_unknown_strategy_raises_key_error() -> None:
    with pytest.raises(KeyError):
        get("does_not_exist_v1")


def test_no_hmm_or_mtf_in_ids() -> None:
    """OSS 同梱方針として HMM / MTF / optimized は除外する。"""
    forbidden_keywords = ("hmm", "mtf", "optimized")
    for sid in list_ids():
        lowered = sid.lower()
        for kw in forbidden_keywords:
            assert kw not in lowered, f"{sid}: forbidden keyword {kw!r} found"
