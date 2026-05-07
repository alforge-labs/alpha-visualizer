"""BacktestResultsRepository のユニットテスト"""
from __future__ import annotations

import sqlite3
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from sqlalchemy.exc import OperationalError

from alpha_visualizer.db import get_engine
from alpha_visualizer.repositories.backtest_results import (
    BacktestResultRow,
    BacktestResultsRepository,
)


def _make_db(tmp_path: Path) -> Path:
    """forge.db 互換スキーマで `backtest_results` テーブルを作り、3 行投入する。"""
    db_path = tmp_path / "forge.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
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
            )
            """
        )
        rows = [
            (
                "run_001",
                "sma_cross",
                "AAPL",
                "2026-04-01T12:00:00",
                10.0, 5.0, 1.2, 1.4, 0.9, -8.0,
                42, 60.0, 1.5, 3.0,
                "{}", "[]", "[]", "[]", None,
            ),
            (
                "run_002",
                "sma_cross",
                "MSFT",
                "2026-04-02T12:00:00",
                12.0, 6.0, 1.3, 1.5, 1.0, -7.0,
                30, 65.0, 1.7, 4.0,
                "{}", "[]", "[]", "[]", "2026-03-01",
            ),
            (
                "run_003",
                "ema_cross",
                "MSFT",
                "2026-04-03T12:00:00",
                8.0, 4.0, 1.0, 1.1, 0.8, -10.0,
                50, 55.0, 1.3, 2.0,
                "{}", "[]", "[]", "[]", None,
            ),
        ]
        conn.executemany(
            """
            INSERT INTO backtest_results (
                run_id, strategy_id, symbol, run_at,
                total_return_pct, cagr_pct, sharpe_ratio, sortino_ratio,
                calmar_ratio, max_drawdown_pct, total_trades, win_rate_pct,
                profit_factor, avg_holding_days,
                metrics_json, equity_curve_json, buy_hold_curve_json,
                trades_json, oos_start
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    return db_path


def test_list_results_returns_all_rows(tmp_path: Path) -> None:
    """フィルタなしで全 3 行を返す（run_at 降順）"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    rows = repo.list_results()

    assert len(rows) == 3
    assert all(isinstance(r, BacktestResultRow) for r in rows)
    # run_at 降順
    assert [r.run_id for r in rows] == ["run_003", "run_002", "run_001"]


def test_list_results_filters_by_strategy_id(tmp_path: Path) -> None:
    """strategy_id 指定で 2 行を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    rows = repo.list_results(strategy_id="sma_cross")

    assert len(rows) == 2
    assert {r.run_id for r in rows} == {"run_001", "run_002"}
    assert all(r.strategy_id == "sma_cross" for r in rows)


def test_list_results_filters_by_symbol(tmp_path: Path) -> None:
    """symbol 指定で AAPL の 1 行のみを返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    rows = repo.list_results(symbol="AAPL")

    assert len(rows) == 1
    assert rows[0].run_id == "run_001"
    assert rows[0].symbol == "AAPL"


def test_list_results_returns_empty_when_table_missing(tmp_path: Path) -> None:
    """テーブルが存在しない場合は例外が伝播する（Router 側で file 存在チェックを行う）。"""
    db_path = tmp_path / "missing.db"
    # 空ファイルを作っておく（テーブル無し）
    db_path.touch()
    engine = get_engine(db_path)
    repo = BacktestResultsRepository(engine)

    with pytest.raises(OperationalError):
        repo.list_results()


def test_get_result_returns_row(tmp_path: Path) -> None:
    """run_id 指定で対応する 1 行を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    row = repo.get_result("run_002")

    assert row is not None
    assert isinstance(row, BacktestResultRow)
    assert row.run_id == "run_002"
    assert row.strategy_id == "sma_cross"
    assert row.symbol == "MSFT"
    assert row.oos_start == "2026-03-01"
    assert row.total_trades == 30


def test_get_result_returns_none_for_missing(tmp_path: Path) -> None:
    """存在しない run_id では None を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    row = repo.get_result("does_not_exist")

    assert row is None


def test_backtest_result_row_is_immutable(tmp_path: Path) -> None:
    """BacktestResultRow はフローズンで属性変更できない"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    row = repo.get_result("run_001")
    assert row is not None
    with pytest.raises((AttributeError, FrozenInstanceError)):
        row.run_id = "tampered"  # type: ignore[misc]
