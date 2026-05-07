"""OptimizationRepository のユニットテスト"""
from __future__ import annotations

import sqlite3
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from sqlalchemy.exc import OperationalError

from alpha_visualizer.db import get_engine
from alpha_visualizer.repositories.optimization import (
    OptimizationRepository,
    OptimizationRunRow,
)


def _make_db(tmp_path: Path) -> Path:
    """forge.db 互換スキーマで `optimization_runs` / `backtest_results` を作る。"""
    db_path = tmp_path / "forge.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE optimization_runs (
                run_id TEXT PRIMARY KEY,
                strategy_id TEXT,
                symbol TEXT,
                run_at TEXT,
                n_trials INTEGER,
                best_metric_name TEXT,
                best_metric_value REAL,
                best_params_json TEXT,
                duration_seconds REAL,
                all_trials_json TEXT
            );
            CREATE TABLE backtest_results (
                run_id TEXT PRIMARY KEY,
                strategy_id TEXT,
                symbol TEXT,
                run_at TEXT,
                total_return_pct REAL,
                cagr_pct REAL,
                sharpe_ratio REAL,
                sortino_ratio REAL,
                calmar_ratio REAL,
                max_drawdown_pct REAL,
                total_trades INTEGER,
                win_rate_pct REAL,
                profit_factor REAL,
                avg_holding_days REAL,
                metrics_json TEXT,
                equity_curve_json TEXT,
                buy_hold_curve_json TEXT,
                trades_json TEXT,
                oos_start TEXT
            );
            """
        )
        opt_rows = [
            (
                "opt_001",
                "wfo_strategy",
                "AAPL",
                "2026-01-01T00:00:00",
                10,
                "sharpe_ratio",
                1.2,
                "{}",
                3.5,
                '[{"window_id": 1}]',
            ),
            (
                "opt_002",
                "wfo_strategy",
                "AAPL",
                "2026-02-01T00:00:00",
                20,
                "sharpe_ratio",
                1.8,
                "{}",
                5.0,
                '[{"window_id": 2}]',
            ),
            (
                "opt_003",
                "other_strategy",
                "MSFT",
                "2026-03-01T00:00:00",
                15,
                "sortino_ratio",
                1.0,
                "{}",
                2.0,
                None,
            ),
        ]
        conn.executemany(
            """INSERT INTO optimization_runs
               (run_id, strategy_id, symbol, run_at, n_trials,
                best_metric_name, best_metric_value, best_params_json,
                duration_seconds, all_trials_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            opt_rows,
        )
        bt_rows = [
            (
                "bt_001",
                "wfo_strategy",
                "AAPL",
                "2026-01-15T00:00:00",
                "[{\"date\": \"2021-07-01\", \"value\": 100.0}]",
                "2021-07-01",
            ),
            (
                "bt_002",
                "wfo_strategy",
                "AAPL",
                "2026-02-15T00:00:00",
                "[{\"date\": \"2021-07-01\", \"value\": 105.0}]",
                "2021-07-01",
            ),
            (
                "bt_003",
                "wfo_strategy",
                "AAPL",
                "2026-03-15T00:00:00",
                "[{\"date\": \"2022-07-01\", \"value\": 200.0}]",
                "2022-07-01",
            ),
        ]
        conn.executemany(
            """INSERT INTO backtest_results
               (run_id, strategy_id, symbol, run_at,
                equity_curve_json, oos_start)
               VALUES (?, ?, ?, ?, ?, ?)""",
            bt_rows,
        )
    return db_path


def test_get_latest_for_strategy_returns_row(tmp_path: Path) -> None:
    """run_at 降順で最新の 1 行を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    row = repo.get_latest_for_strategy("wfo_strategy")

    assert row is not None
    assert isinstance(row, OptimizationRunRow)
    assert row.run_id == "opt_002"
    assert row.best_metric_value == pytest.approx(1.8)
    assert row.all_trials_json == '[{"window_id": 2}]'


def test_get_latest_for_strategy_returns_none_when_missing(tmp_path: Path) -> None:
    """該当 strategy_id がなければ None を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    row = repo.get_latest_for_strategy("does_not_exist")

    assert row is None


def test_optimization_run_row_is_immutable(tmp_path: Path) -> None:
    """OptimizationRunRow はフローズンで属性変更できない"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    row = repo.get_latest_for_strategy("wfo_strategy")
    assert row is not None
    with pytest.raises((AttributeError, FrozenInstanceError)):
        row.run_id = "tampered"  # type: ignore[misc]


def test_list_runs_for_strategy_returns_runs_desc(tmp_path: Path) -> None:
    """同じ strategy_id の全ランを run_at 降順で返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    rows = repo.list_runs_for_strategy("wfo_strategy")

    assert len(rows) == 2
    assert all(isinstance(r, OptimizationRunRow) for r in rows)
    assert [r.run_id for r in rows] == ["opt_002", "opt_001"]


def test_list_runs_for_strategy_returns_empty_when_missing(tmp_path: Path) -> None:
    """該当 strategy_id がなければ空リストを返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    rows = repo.list_runs_for_strategy("does_not_exist")

    assert rows == []


def test_find_oos_equity_curve_json_returns_latest(tmp_path: Path) -> None:
    """`(strategy_id, oos_start)` 一致の最新ランの equity_curve_json を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    raw = repo.find_oos_equity_curve_json("wfo_strategy", "2021-07-01")

    # 同じ oos_start に 2 行あり、run_at 降順で bt_002 が選ばれる
    assert raw == '[{"date": "2021-07-01", "value": 105.0}]'


def test_find_oos_equity_curve_json_returns_none_when_missing(
    tmp_path: Path,
) -> None:
    """該当行がなければ None を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = OptimizationRepository(engine)

    raw = repo.find_oos_equity_curve_json("wfo_strategy", "1999-01-01")

    assert raw is None


def test_get_latest_for_strategy_raises_when_table_missing(tmp_path: Path) -> None:
    """テーブル不在の DB では SQLAlchemy が例外を投げる（router 側で握る前提）"""
    db_path = tmp_path / "missing.db"
    db_path.touch()
    engine = get_engine(db_path)
    repo = OptimizationRepository(engine)

    with pytest.raises(OperationalError):
        repo.get_latest_for_strategy("wfo_strategy")
