"""db モジュールの test"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from alpha_visualizer.db import get_engine, metadata


def test_get_engine_returns_engine_for_existing_db(tmp_path: Path) -> None:
    db_path = tmp_path / "forge.db"
    sqlite3.connect(db_path).close()
    engine = get_engine(db_path)
    assert engine.url.database == str(db_path)


def test_get_engine_uses_sqlite_dialect(tmp_path: Path) -> None:
    db_path = tmp_path / "forge.db"
    sqlite3.connect(db_path).close()
    engine = get_engine(db_path)
    assert engine.dialect.name == "sqlite"


def test_get_engine_accepts_str_path(tmp_path: Path) -> None:
    db_path = tmp_path / "forge.db"
    sqlite3.connect(db_path).close()
    engine = get_engine(str(db_path))
    assert engine.url.database == str(db_path)


def test_metadata_contains_known_tables() -> None:
    table_names = set(metadata.tables.keys())
    assert {"strategies", "backtest_results", "optimization_runs"}.issubset(table_names)
