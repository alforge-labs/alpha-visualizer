"""StrategiesRepository のユニットテスト"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from alpha_visualizer.db import metadata, strategies
from alpha_visualizer.errors import DataSourceUnavailableError
from alpha_visualizer.repositories.strategies import (
    StrategiesRepository,
    StrategyRow,
)

# --- JSON モード用フィクスチャ ----------------------------------------------


def _make_json_dir(tmp_path: Path) -> Path:
    """JSON モード用に複数の戦略 JSON ファイルを書き出す。"""
    strategies_dir = tmp_path / "strategies"
    strategies_dir.mkdir()
    (strategies_dir / "alpha.json").write_text(
        json.dumps(
            {
                "strategy_id": "alpha",
                "name": "Alpha 戦略",
                "version": "1.0.0",
                "asset_type": "stock",
                "timeframe": "1d",
                "tags": ["momentum"],
                "target_symbols": ["AAPL", "MSFT"],
                "parameters": {"period": 14},
            }
        ),
        encoding="utf-8",
    )
    (strategies_dir / "beta.json").write_text(
        json.dumps(
            {
                "strategy_id": "beta",
                "name": "Beta 戦略",
                "timeframe": "1h",
            }
        ),
        encoding="utf-8",
    )
    return strategies_dir


# --- DB モード用フィクスチャ ------------------------------------------------


def _make_strategies_db(tmp_path: Path) -> Path:
    """DB モード用に strategies.db を作成し 2 行投入する。

    スキーマは ``alpha_visualizer.db.metadata`` を Single Source of Truth として生成。
    """
    db_path = tmp_path / "strategies.db"
    schema_engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        metadata.create_all(schema_engine, tables=[strategies])
    finally:
        schema_engine.dispose()
    with sqlite3.connect(db_path) as conn:
        rows = [
            (
                "db_alpha",
                "DB Alpha",
                "1.0.0",
                "stock",
                "1d",
                '["momentum","leveraged"]',
                "",
                json.dumps(
                    {
                        "strategy_id": "db_alpha",
                        "name": "DB Alpha",
                        "target_symbols": ["TQQQ", "QQQ"],
                        "parameters": {"period": 20},
                    }
                ),
            ),
            (
                "db_beta",
                "DB Beta",
                "0.5.0",
                "fx",
                "1h",
                "[]",
                "",
                json.dumps(
                    {
                        "strategy_id": "db_beta",
                        "name": "DB Beta",
                        "target_symbols": [],
                    }
                ),
            ),
        ]
        conn.executemany(
            """
            INSERT INTO strategies (
                strategy_id, name, version, asset_type, timeframe,
                tags, notes, definition_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    return db_path


# --- JSON モードのテスト ----------------------------------------------------


def test_list_strategies_json_mode_returns_all_files_sorted(tmp_path: Path) -> None:
    """JSON モード: strategies_dir/*.json を sorted-glob 順で全件返す"""
    strategies_dir = _make_json_dir(tmp_path)

    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )
    rows = repo.list_strategies()

    assert len(rows) == 2
    assert all(isinstance(r, StrategyRow) for r in rows)
    # sorted-glob: alpha.json → beta.json
    assert [r.strategy_id for r in rows] == ["alpha", "beta"]
    assert rows[0].name == "Alpha 戦略"
    assert rows[0].timeframe == "1d"
    assert rows[0].tags == ("momentum",)
    assert rows[0].target_symbols == ("AAPL", "MSFT")


def test_list_strategies_json_mode_when_dir_missing_returns_empty(
    tmp_path: Path,
) -> None:
    """strategies_dir が存在しない場合は空リスト"""
    repo = StrategiesRepository.from_paths(
        strategies_dir=tmp_path / "missing_dir", strategies_db=None
    )
    assert repo.list_strategies() == []


def test_list_strategies_falls_back_to_json_when_db_path_none(tmp_path: Path) -> None:
    """strategies_db=None の場合は JSON モードにフォールバックする"""
    strategies_dir = _make_json_dir(tmp_path)

    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )
    rows = repo.list_strategies()
    assert {r.strategy_id for r in rows} == {"alpha", "beta"}


def test_list_strategies_fails_loud_when_db_mode_but_db_file_missing(
    tmp_path: Path,
) -> None:
    """DB モード設定（strategies_db 指定）なのにファイルが無い場合は Fail Loud。

    issue #210: 黙って stale な JSON へフォールバックすると、利用者が最新のつもり
    で古い戦略を見てしまう。明示エラー（DataSourceUnavailableError）を投げて、
    設定と実体の不一致を伝える。JSON ディレクトリが存在していてもエラーにする。
    """
    strategies_dir = _make_json_dir(tmp_path)  # JSON は存在するが使われない

    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir,
        strategies_db=tmp_path / "does_not_exist.db",
    )
    with pytest.raises(DataSourceUnavailableError) as exc_info:
        repo.list_strategies()
    # メッセージに実体パスが含まれ、原因を特定できる
    assert "does_not_exist.db" in str(exc_info.value)


# --- DB モードのテスト ------------------------------------------------------


def test_list_strategies_db_mode_returns_all_rows(tmp_path: Path) -> None:
    """DB モード: strategies テーブルから全件返す"""
    strategies_dir = tmp_path / "strategies"
    strategies_dir.mkdir()
    db_path = _make_strategies_db(strategies_dir)

    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=db_path
    )
    rows = repo.list_strategies()

    assert len(rows) == 2
    ids = {r.strategy_id for r in rows}
    assert ids == {"db_alpha", "db_beta"}

    by_id = {r.strategy_id: r for r in rows}
    assert by_id["db_alpha"].name == "DB Alpha"
    assert by_id["db_alpha"].timeframe == "1d"
    assert by_id["db_alpha"].tags == ("momentum", "leveraged")
    assert by_id["db_alpha"].target_symbols == ("TQQQ", "QQQ")
    assert by_id["db_beta"].tags == ()
    assert by_id["db_beta"].target_symbols == ()


def test_list_strategies_db_mode_empty_table_returns_empty_not_json(
    tmp_path: Path,
) -> None:
    """DB モードで strategies テーブルが空（0 件）なら空を返す。

    issue #210: 空テーブルは「戦略がまだ無い」正規状態であり、エラーにも JSON
    フォールバックにもしない。stale な JSON へ落ちないことを保証する。
    """
    strategies_dir = tmp_path / "strategies"
    strategies_dir.mkdir()
    # JSON も置くが、DB（空）が優先され JSON は無視されることを確認する
    (strategies_dir / "stale.json").write_text(
        json.dumps({"strategy_id": "stale", "name": "古い戦略"}),
        encoding="utf-8",
    )
    db_path = strategies_dir / "strategies.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        metadata.create_all(engine, tables=[strategies])  # 空テーブルのみ
    finally:
        engine.dispose()

    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=db_path
    )
    assert repo.list_strategies() == []


# --- 共通操作 ---------------------------------------------------------------


def test_get_strategy_returns_match(tmp_path: Path) -> None:
    """get_strategy: 該当 strategy_id の行を返す"""
    strategies_dir = _make_json_dir(tmp_path)
    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )

    row = repo.get_strategy("alpha")

    assert row is not None
    assert row.strategy_id == "alpha"
    assert row.name == "Alpha 戦略"


def test_get_strategy_returns_none_when_missing(tmp_path: Path) -> None:
    """get_strategy: 該当しない場合は None"""
    strategies_dir = _make_json_dir(tmp_path)
    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )

    assert repo.get_strategy("nonexistent") is None


def test_find_by_ids_returns_subset(tmp_path: Path) -> None:
    """find_by_ids: 指定 ID のみを返す。順序は内部リスト順"""
    strategies_dir = _make_json_dir(tmp_path)
    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )

    rows = repo.find_by_ids(["beta", "alpha", "missing"])

    assert {r.strategy_id for r in rows} == {"alpha", "beta"}


def test_strategy_row_is_immutable(tmp_path: Path) -> None:
    """StrategyRow は frozen で属性変更できない"""
    strategies_dir = _make_json_dir(tmp_path)
    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )

    row = repo.get_strategy("alpha")
    assert row is not None
    with pytest.raises((AttributeError, FrozenInstanceError)):
        row.strategy_id = "tampered"  # type: ignore[misc]


def test_raw_definition_is_parseable_json(tmp_path: Path) -> None:
    """raw_definition は JSON 文字列で、Service 層で json.loads できる。

    detail エンドポイントは parameters/indicators 等を参照するため、
    構造化フィールドへアクセスできる必要がある。
    """
    strategies_dir = _make_json_dir(tmp_path)
    repo = StrategiesRepository.from_paths(
        strategies_dir=strategies_dir, strategies_db=None
    )
    row = repo.get_strategy("alpha")
    assert row is not None

    parsed = json.loads(row.raw_definition)
    assert parsed["parameters"] == {"period": 14}
