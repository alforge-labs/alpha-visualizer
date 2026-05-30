"""LiveDataRepository のユニットテスト（issue #209: SQLite 直読み）。

live 実績は ``backtest_results.db`` の live_summaries / live_trades /
live_position_summaries テーブルから読む。本テストはその読み取り・正規化・
tolerant 挙動（live テーブル未作成 DB / engine=None）を検証する。
"""
from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

from alpha_visualizer.db import backtest_results, get_engine, metadata
from alpha_visualizer.repositories.backtest_results import BacktestResultRow
from alpha_visualizer.repositories.live import LiveDataRepository
from tests.factories import (
    build_backtest_db,
    seed_backtest_with_trades,
    seed_live_position_summary,
    seed_live_summary,
    seed_live_trades,
)


def _db_with_live(tmp_path: Path) -> Path:
    """live + backtest スキーマ込みの空 DB パスを返す（factories が schema を作る）。"""
    return tmp_path / "data" / "results" / "backtest_results.db"


def _repo(db_path: Path) -> LiveDataRepository:
    return LiveDataRepository(get_engine(db_path))


# ----------------------------------------------------------------------
# engine=None（backtest_results.db 不在, issue #173）
# ----------------------------------------------------------------------
def test_none_engine_returns_empty() -> None:
    """engine=None なら live データは全て空 / None を返す（例外を上げない）。"""
    repo = LiveDataRepository(None)
    assert repo.list_summary_strategy_ids() == []
    assert repo.list_position_portfolio_ids() == []
    assert repo.has_summary("x") is False
    assert repo.has_trades("x") is False
    assert repo.load_summary("x") is None
    assert repo.load_raw_trades("x") == []
    assert repo.load_position_summary("x") is None
    assert repo.fetch_backtest_for_diff("x", None) is None


# ----------------------------------------------------------------------
# live テーブル未作成の DB（古い backtest 専用 DB）でも tolerant に空扱い
# ----------------------------------------------------------------------
def test_missing_live_tables_returns_empty(tmp_path: Path) -> None:
    """live_* テーブルが無い DB でも list/load は空を返し 500 にしない。"""
    db_path = tmp_path / "bt_only.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        metadata.create_all(engine, tables=[backtest_results])
    finally:
        engine.dispose()

    repo = _repo(db_path)
    assert repo.list_summary_strategy_ids() == []
    assert repo.list_position_portfolio_ids() == []
    assert repo.has_summary("x") is False
    assert repo.load_summary("x") is None
    assert repo.load_raw_trades("x") == []
    assert repo.load_position_summary("x") is None


def test_non_missing_table_operational_error_is_reraised() -> None:
    """``no such table`` 以外の OperationalError は握り潰さず再送出する（Fail Loud）。"""

    class _BoomEngine:
        def connect(self):  # noqa: ANN202 - テスト用ダミー
            raise OperationalError("SELECT 1", {}, Exception("database is locked"))

    repo = LiveDataRepository(_BoomEngine())  # type: ignore[arg-type]
    with pytest.raises(OperationalError):
        repo.list_summary_strategy_ids()


# ----------------------------------------------------------------------
# list_summary_strategy_ids / list_position_portfolio_ids
# ----------------------------------------------------------------------
def test_list_summary_strategy_ids_sorted(tmp_path: Path) -> None:
    """live_summaries の strategy_id を昇順で返す。"""
    db_path = _db_with_live(tmp_path)
    seed_live_summary(db_path, "zeta", {})
    seed_live_summary(db_path, "alpha", {})
    seed_live_summary(db_path, "mid", {})
    assert _repo(db_path).list_summary_strategy_ids() == ["alpha", "mid", "zeta"]


def test_list_position_portfolio_ids_sorted(tmp_path: Path) -> None:
    """live_position_summaries の portfolio_id を昇順で返す。"""
    db_path = _db_with_live(tmp_path)
    seed_live_position_summary(db_path, "p_b", metrics={})
    seed_live_position_summary(db_path, "p_a", metrics={})
    assert _repo(db_path).list_position_portfolio_ids() == ["p_a", "p_b"]


# ----------------------------------------------------------------------
# has_summary / has_trades
# ----------------------------------------------------------------------
def test_has_summary_and_trades(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    # 先に summary を seed して DB（スキーマ）を作ってから repo を構築する。
    # repo は engine を保持し毎回 DB の最新状態を読むため、以降の seed も反映される。
    seed_live_summary(db_path, "present", {"strategy_id": "present"})
    repo = _repo(db_path)
    assert repo.has_summary("absent") is False
    assert repo.has_trades("absent") is False
    assert repo.has_summary("present") is True
    assert repo.has_trades("present") is False

    seed_live_trades(
        db_path,
        "present",
        [{"trade_id": "t1", "entry_at": "2026-04-01", "exit_at": "2026-04-02"}],
    )
    assert repo.has_trades("present") is True


def test_strategy_ids_with_trades_returns_only_those_with_trades(
    tmp_path: Path,
) -> None:
    """trades を持つ strategy_id のみ集合で返す（一覧の N+1 回避用）。"""
    db_path = _db_with_live(tmp_path)
    seed_live_summary(db_path, "with_trades", {})
    seed_live_summary(db_path, "no_trades", {})
    seed_live_trades(
        db_path,
        "with_trades",
        [
            {"trade_id": "t1", "entry_at": "2026-04-01", "exit_at": "2026-04-02"},
            {"trade_id": "t2", "entry_at": "2026-04-03", "exit_at": "2026-04-04"},
        ],
    )
    assert _repo(db_path).strategy_ids_with_trades() == {"with_trades"}


# ----------------------------------------------------------------------
# load_summary
# ----------------------------------------------------------------------
def test_load_summary_returns_dict_with_parsed_symbols(tmp_path: Path) -> None:
    """summary を辞書で返し、symbols(JSON TEXT) を list にパースする。"""
    db_path = _db_with_live(tmp_path)
    seed_live_summary(
        db_path,
        "s",
        {"strategy_id": "s", "total_trades": 3, "symbols": ["AAPL", "MSFT"]},
    )
    summary = _repo(db_path).load_summary("s")
    assert summary is not None
    assert summary["strategy_id"] == "s"
    assert summary["total_trades"] == 3
    assert summary["symbols"] == ["AAPL", "MSFT"]


def test_load_summary_returns_none_for_missing(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    seed_live_summary(db_path, "exists", {})
    assert _repo(db_path).load_summary("absent") is None


# ----------------------------------------------------------------------
# load_raw_trades
# ----------------------------------------------------------------------
def test_load_raw_trades_returns_empty_for_missing(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    seed_live_summary(db_path, "exists", {})
    assert _repo(db_path).load_raw_trades("absent") == []


def test_load_raw_trades_ordered_by_entry_at_with_parsed_tags(
    tmp_path: Path,
) -> None:
    """trades を entry_at 昇順で返し、tags(JSON TEXT) を list にパースする。"""
    db_path = _db_with_live(tmp_path)
    seed_live_trades(
        db_path,
        "s",
        [
            {
                "trade_id": "late",
                "entry_at": "2026-04-15T00:00:00",
                "exit_at": "2026-04-16T00:00:00",
                "tags": ["b"],
            },
            {
                "trade_id": "early",
                "entry_at": "2026-04-01T00:00:00",
                "exit_at": "2026-04-02T00:00:00",
                "tags": ["a"],
            },
        ],
    )
    items = _repo(db_path).load_raw_trades("s")
    assert [t["trade_id"] for t in items] == ["early", "late"]
    assert items[0]["tags"] == ["a"]


# ----------------------------------------------------------------------
# load_position_summary
# ----------------------------------------------------------------------
def test_load_position_summary_parses_json_fields(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    seed_live_position_summary(
        db_path,
        "combo",
        metrics={"sharpe_ratio": 1.4},
        equity=[["2026-04-01T00:00:00", 100.0]],
        backtest_metrics={"sharpe_ratio": 1.2},
        receipts_count=3,
        sub_strategies=["a", "b"],
    )
    pos = _repo(db_path).load_position_summary("combo")
    assert pos is not None
    assert pos["portfolio_id"] == "combo"
    assert pos["metrics"] == {"sharpe_ratio": 1.4}
    assert pos["backtest_metrics"] == {"sharpe_ratio": 1.2}
    assert pos["equity"] == [["2026-04-01T00:00:00", 100.0]]
    assert pos["receipts_count"] == 3
    assert pos["sub_strategies"] == ["a", "b"]


def test_load_position_summary_returns_none_for_missing(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    seed_live_position_summary(db_path, "exists", metrics={})
    assert _repo(db_path).load_position_summary("absent") is None


def test_load_position_summary_backtest_metrics_none_when_absent(
    tmp_path: Path,
) -> None:
    """--compare 無しで保存された行は backtest_metrics が None になる。"""
    db_path = _db_with_live(tmp_path)
    seed_live_position_summary(db_path, "combo", metrics={"sharpe_ratio": 1.0})
    pos = _repo(db_path).load_position_summary("combo")
    assert pos is not None
    assert pos["backtest_metrics"] is None


# ----------------------------------------------------------------------
# fetch_backtest_for_diff（既存挙動の維持）
# ----------------------------------------------------------------------
def test_fetch_backtest_for_diff_returns_latest_when_run_id_none(
    tmp_path: Path,
) -> None:
    db_path = _db_with_live(tmp_path)
    build_backtest_db(db_path)
    seed_backtest_with_trades(
        db_path, run_id="old_run", strategy_id="strat_x",
        run_at="2026-03-01T00:00:00", trades=[],
    )
    seed_backtest_with_trades(
        db_path, run_id="new_run", strategy_id="strat_x",
        run_at="2026-04-30T00:00:00", trades=[],
    )
    row = _repo(db_path).fetch_backtest_for_diff("strat_x", None)
    assert isinstance(row, BacktestResultRow)
    assert row.run_id == "new_run"


def test_fetch_backtest_for_diff_returns_specified_run(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    build_backtest_db(db_path)
    seed_backtest_with_trades(
        db_path, run_id="old_run", strategy_id="strat_x",
        run_at="2026-03-01T00:00:00", trades=[],
    )
    row = _repo(db_path).fetch_backtest_for_diff("strat_x", "old_run")
    assert isinstance(row, BacktestResultRow)
    assert row.run_id == "old_run"


def test_fetch_backtest_for_diff_returns_none_for_missing(tmp_path: Path) -> None:
    db_path = _db_with_live(tmp_path)
    build_backtest_db(db_path)
    seed_backtest_with_trades(
        db_path, run_id="r", strategy_id="strat_x",
        run_at="2026-03-01T00:00:00", trades=[],
    )
    repo = _repo(db_path)
    assert repo.fetch_backtest_for_diff("does_not_exist", None) is None
    assert repo.fetch_backtest_for_diff("strat_x", "missing_run") is None


def test_fetch_backtest_for_diff_propagates_when_table_missing(
    tmp_path: Path,
) -> None:
    """backtest_results テーブルが無い DB では OperationalError を伝播する。

    live メソッド（_fetch_all）は no such table を空扱いにするが、backtest 連携は
    BacktestResultsRepository に委譲しており、そちらは握り潰さない。router 側の
    try/except が機能していることの前提となるレグレッションガード。
    """
    db_path = tmp_path / "empty.db"
    db_path.touch()
    repo = _repo(db_path)
    with pytest.raises(OperationalError):
        repo.fetch_backtest_for_diff("any", None)
