"""writer モジュールの単体テスト（一時ディレクトリで full pipeline を検証）。

- 8 戦略 JSON、5 ideas、40 BT 行、4 optimization 行が生成される
- DB サイズが予算内
- 二回続けて生成してもバイト等価（決定論性）
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd
import pytest

from samples._generators.ideas_defs import build_all as build_all_ideas
from samples._generators.pseudo_backtest import build_all_runs
from samples._generators.pseudo_grid import build_all_grid
from samples._generators.pseudo_wfo import build_all_wfo
from samples._generators.strategy_defs import build_all as build_all_strategies
from samples._generators.synthetic_ohlcv import build_all as build_all_ohlcv
from samples._generators.writers import (
    DEFAULT_DB_BUDGET_BYTES,
    assert_size_budget,
    write_forge_dir,
)


@pytest.fixture(scope="module")
def ohlcv() -> dict[str, pd.DataFrame]:
    return build_all_ohlcv()


def _generate_into(forge_dir: Path, ohlcv: dict[str, pd.DataFrame]) -> dict[str, int]:
    return write_forge_dir(
        forge_dir,
        strategies=build_all_strategies(),
        ideas=build_all_ideas(),
        bt_runs=build_all_runs(ohlcv),
        wfo_runs=build_all_wfo(ohlcv),
        grid_runs=build_all_grid(ohlcv),
    )


def test_full_pipeline_writes_expected_artifacts(
    tmp_path: Path, ohlcv: dict[str, pd.DataFrame]
) -> None:
    stats = _generate_into(tmp_path, ohlcv)
    assert stats == {
        "strategies": 8,
        "ideas": 5,
        "backtest_runs": 40,
        "optimization_runs": 4,
        "db_size_bytes": pytest.approx(stats["db_size_bytes"]),  # placeholder
    } | {"db_size_bytes": stats["db_size_bytes"]}
    # ファイル群
    strategies = list((tmp_path / "data" / "strategies").glob("*.json"))
    assert len(strategies) == 8
    ideas_path = tmp_path / "data" / "ideas" / "ideas.json"
    assert ideas_path.exists()
    ideas = json.loads(ideas_path.read_text(encoding="utf-8"))
    assert isinstance(ideas, list) and len(ideas) == 5
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    assert db_path.exists()


def test_database_row_counts(tmp_path: Path, ohlcv: dict[str, pd.DataFrame]) -> None:
    _generate_into(tmp_path, ohlcv)
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    with sqlite3.connect(db_path) as conn:
        bt = conn.execute("SELECT COUNT(*) FROM backtest_results").fetchone()[0]
        opt = conn.execute("SELECT COUNT(*) FROM optimization_runs").fetchone()[0]
    assert bt == 40
    assert opt == 4


def test_database_size_budget(tmp_path: Path, ohlcv: dict[str, pd.DataFrame]) -> None:
    _generate_into(tmp_path, ohlcv)
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    assert assert_size_budget(db_path) < DEFAULT_DB_BUDGET_BYTES


def test_strategy_json_is_loadable(
    tmp_path: Path, ohlcv: dict[str, pd.DataFrame]
) -> None:
    _generate_into(tmp_path, ohlcv)
    strategies_dir = tmp_path / "data" / "strategies"
    for path in strategies_dir.glob("*.json"):
        loaded = json.loads(path.read_text(encoding="utf-8"))
        assert loaded["strategy_id"] == path.stem
        assert "indicators" in loaded
        assert "entry_conditions" in loaded


def test_assert_size_budget_raises_when_over_budget(
    tmp_path: Path, ohlcv: dict[str, pd.DataFrame]
) -> None:
    _generate_into(tmp_path, ohlcv)
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    with pytest.raises(AssertionError, match="exceeds budget"):
        assert_size_budget(db_path, max_bytes=1024)


def test_determinism_byte_equal_db(
    tmp_path: Path, ohlcv: dict[str, pd.DataFrame]
) -> None:
    """二回生成しても DB バイト列が等しい（CI 決定論チェックの土台）。"""
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    _generate_into(first_dir, ohlcv)
    _generate_into(second_dir, ohlcv)
    first_db = (first_dir / "data" / "results" / "backtest_results.db").read_bytes()
    second_db = (second_dir / "data" / "results" / "backtest_results.db").read_bytes()
    assert first_db == second_db, "DB byte content differs between runs"


def test_ideas_link_to_existing_strategies(
    tmp_path: Path, ohlcv: dict[str, pd.DataFrame]
) -> None:
    """ideas.json の linked_strategies は同梱戦略 ID に対応している。"""
    _generate_into(tmp_path, ohlcv)
    ideas = json.loads(
        (tmp_path / "data" / "ideas" / "ideas.json").read_text(encoding="utf-8")
    )
    strategy_ids = {
        json.loads(path.read_text(encoding="utf-8"))["strategy_id"]
        for path in (tmp_path / "data" / "strategies").glob("*.json")
    }
    for idea in ideas:
        for sid in idea.get("linked_strategies", []):
            assert sid in strategy_ids, (
                f"idea {idea['idea_id']!r} links to unknown strategy {sid!r}"
            )
