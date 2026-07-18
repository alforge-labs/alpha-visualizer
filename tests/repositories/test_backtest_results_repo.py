"""BacktestResultsRepository のユニットテスト"""
from __future__ import annotations

import sqlite3
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

from alpha_visualizer.db import backtest_results, get_engine, metadata
from alpha_visualizer.repositories.backtest_results import (
    BacktestResultRow,
    BacktestResultsRepository,
)


def _make_db(tmp_path: Path) -> Path:
    """backtest_results.db 互換スキーマで `backtest_results` テーブルを作り、3 行投入する。

    スキーマは ``alpha_visualizer.db.metadata`` を Single Source of Truth として生成。
    """
    db_path = tmp_path / "backtest_results.db"
    schema_engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        metadata.create_all(schema_engine, tables=[backtest_results])
    finally:
        schema_engine.dispose()
    with sqlite3.connect(db_path) as conn:
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


def test_list_results_raises_operational_error_when_table_missing(tmp_path: Path) -> None:
    """テーブルが存在しない場合は OperationalError が伝播する（Router 側で file 存在チェックを行う）。"""
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


def test_find_latest_run_id(tmp_path: Path) -> None:
    """同一 strategy_id × symbol の最新 run_at を持つ run_id を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    # フィクスチャでは sma_cross/MSFT は run_002 が最新（2026-04-02）
    assert repo.find_latest_run_id(strategy_id="sma_cross", symbol="MSFT") == "run_002"


def test_find_latest_run_id_returns_none(tmp_path: Path) -> None:
    """該当する組み合わせがない場合は None を返す"""
    engine = get_engine(_make_db(tmp_path))
    repo = BacktestResultsRepository(engine)

    assert repo.find_latest_run_id(strategy_id="missing", symbol="X") is None


def test_find_latest_by_strategy_ids_returns_map(tmp_path: Path) -> None:
    """各 strategy_id の最新行が dict で返る。"""
    db_path = _make_db(tmp_path)
    repo = BacktestResultsRepository(get_engine(db_path))

    result = repo.find_latest_by_strategy_ids(["sma_cross", "ema_cross"])

    assert isinstance(result, dict)
    # フィクスチャ:
    #   sma_cross の最新は run_002（2026-04-02）
    #   ema_cross の最新は run_003（2026-04-03）
    assert "sma_cross" in result
    assert "ema_cross" in result
    assert isinstance(result["sma_cross"], BacktestResultRow)
    assert result["sma_cross"].run_id == "run_002"
    assert result["ema_cross"].run_id == "run_003"


def test_find_latest_by_strategy_ids_skips_missing(tmp_path: Path) -> None:
    """存在しない strategy_id はキーに含まれない。"""
    db_path = _make_db(tmp_path)
    repo = BacktestResultsRepository(get_engine(db_path))

    result = repo.find_latest_by_strategy_ids(["sma_cross", "nonexistent"])

    assert "sma_cross" in result
    assert "nonexistent" not in result


def test_find_latest_by_strategy_ids_empty_list(tmp_path: Path) -> None:
    """空 list は空 dict を返す（クエリは実行されない）。"""
    db_path = _make_db(tmp_path)
    repo = BacktestResultsRepository(get_engine(db_path))

    assert repo.find_latest_by_strategy_ids([]) == {}


def test_find_latest_by_strategy_ids_returns_latest(tmp_path: Path) -> None:
    """同じ strategy_id の複数行から run_at 降順で最新が選ばれる。"""
    db_path = _make_db(tmp_path)
    repo = BacktestResultsRepository(get_engine(db_path))

    result = repo.find_latest_by_strategy_ids(["sma_cross"])

    # フィクスチャでは sma_cross は run_001（2026-04-01）と run_002（2026-04-02）
    # 最新は run_002
    assert result["sma_cross"].run_id == "run_002"
    assert result["sma_cross"].run_at == "2026-04-02T12:00:00"


class TestSourceColumn:
    """source（実行元 provenance・vis#299）の読み取りテスト。

    WHY: source 列は forge 側の ALTER TABLE（書き込み時）で後付けされるため、
    旧 forge が書いた DB には存在しない。visualizer は読み取り専用で ALTER
    しない（single-writer 原則）ので、列の有無どちらでも読めることを固定する。
    """

    def test_source列があるdbで値が返る(self, tmp_path: Path) -> None:
        db_path = _make_db(tmp_path)
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE backtest_results SET source = 'strategy-file'"
                " WHERE run_id = 'run_001'"
            )
        repo = BacktestResultsRepository(get_engine(db_path))

        row = repo.get_result("run_001")
        assert row is not None
        assert row.source == "strategy-file"
        # 他の行（UPDATE していない）は NULL → None
        rows = {r.run_id: r for r in repo.list_results()}
        assert rows["run_002"].source is None

    def test_find_latest_by_strategy_idsでもsourceが返る(
        self, tmp_path: Path
    ) -> None:
        db_path = _make_db(tmp_path)
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE backtest_results SET source = 'strategy-file'"
                " WHERE run_id = 'run_002'"
            )
        repo = BacktestResultsRepository(get_engine(db_path))

        latest = repo.find_latest_by_strategy_ids(["sma_cross"])
        # sma_cross の最新は run_002（2026-04-02）
        assert latest["sma_cross"].source == "strategy-file"

    def test_source列がない旧dbでも読めてsourceはnone(self, tmp_path: Path) -> None:
        db_path = _make_db(tmp_path)
        with sqlite3.connect(db_path) as conn:
            conn.execute("ALTER TABLE backtest_results DROP COLUMN source")
        repo = BacktestResultsRepository(get_engine(db_path))

        rows = repo.list_results()
        assert len(rows) == 3
        assert all(r.source is None for r in rows)

        row = repo.get_result("run_001")
        assert row is not None
        assert row.source is None

        latest = repo.find_latest_by_strategy_ids(["sma_cross", "ema_cross"])
        assert latest["sma_cross"].source is None
        assert latest["ema_cross"].source is None
