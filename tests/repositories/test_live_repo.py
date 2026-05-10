"""LiveDataRepository のユニットテスト"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

from alpha_visualizer.db import backtest_results, get_engine, metadata
from alpha_visualizer.repositories.backtest_results import BacktestResultRow
from alpha_visualizer.repositories.live import LiveDataRepository


def _seed_summary(live_dir: Path, strategy_id: str, payload: dict) -> Path:
    summaries_dir = live_dir / "summaries"
    summaries_dir.mkdir(parents=True, exist_ok=True)
    path = summaries_dir / f"{strategy_id}.live.summary.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _seed_trades(live_dir: Path, strategy_id: str, trades: list | dict) -> Path:
    trades_dir = live_dir / "trades"
    trades_dir.mkdir(parents=True, exist_ok=True)
    path = trades_dir / f"{strategy_id}.trades.json"
    path.write_text(json.dumps(trades), encoding="utf-8")
    return path


def _make_db_with_backtest(tmp_path: Path) -> Path:
    """backtest_results.db 互換スキーマで `backtest_results` を作って 2 行投入する。

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
                "old_run",
                "strat_x",
                "AAPL",
                "2026-03-01T00:00:00",
                5.0, 2.0, 1.0, 1.1, 0.8, -3.0,
                10, 50.0, 1.2, 2.0,
                "{}", "[]", "[]",
                json.dumps([{"exit_date": "2026-03-15", "return_pct": 1.0, "pnl": 50.0}]),
                None,
            ),
            (
                "new_run",
                "strat_x",
                "AAPL",
                "2026-04-30T00:00:00",
                12.0, 6.0, 1.5, 1.6, 1.0, -4.0,
                20, 60.0, 1.8, 3.0,
                "{}", "[]", "[]",
                json.dumps([{"exit_date": "2026-04-20", "return_pct": 2.0, "pnl": 200.0}]),
                None,
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


# ----------------------------------------------------------------------
# read_json_safe
# ----------------------------------------------------------------------
def test_read_json_safe_returns_none_for_missing_path(tmp_path: Path) -> None:
    """ファイルが存在しないときは None を返す（例外を上げない）。"""
    missing = tmp_path / "nope.json"
    assert LiveDataRepository.read_json_safe(missing) is None


def test_read_json_safe_returns_none_for_invalid_json(tmp_path: Path) -> None:
    """壊れた JSON は None を返す。"""
    broken = tmp_path / "broken.json"
    broken.write_text("{not-json", encoding="utf-8")
    assert LiveDataRepository.read_json_safe(broken) is None


def test_read_json_safe_returns_dict_for_valid_json(tmp_path: Path) -> None:
    """正しい JSON はパースして返す。"""
    path = tmp_path / "good.json"
    payload = {"a": 1, "b": [2, 3]}
    path.write_text(json.dumps(payload), encoding="utf-8")
    assert LiveDataRepository.read_json_safe(path) == payload


def test_read_json_safe_returns_list_for_valid_json_array(tmp_path: Path) -> None:
    """JSON 配列もそのまま返す。"""
    path = tmp_path / "arr.json"
    payload = [{"x": 1}, {"x": 2}]
    path.write_text(json.dumps(payload), encoding="utf-8")
    assert LiveDataRepository.read_json_safe(path) == payload


# ----------------------------------------------------------------------
# パス / 存在チェック
# ----------------------------------------------------------------------
def test_summary_path_and_trades_path_compose_correctly(tmp_path: Path) -> None:
    """live_dir 配下の summaries / trades サブディレクトリへのパスを返す。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    assert repo.summary_path("foo") == live_dir / "summaries" / "foo.live.summary.json"
    assert repo.trades_path("foo") == live_dir / "trades" / "foo.trades.json"


def test_has_summary_and_trades_reflect_filesystem(tmp_path: Path) -> None:
    """has_summary / has_trades はファイルの存在を反映する。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    assert repo.has_summary("absent") is False
    assert repo.has_trades("absent") is False

    _seed_summary(live_dir, "present", {"strategy_id": "present"})
    assert repo.has_summary("present") is True
    assert repo.has_trades("present") is False

    _seed_trades(live_dir, "present", [])
    assert repo.has_trades("present") is True


# ----------------------------------------------------------------------
# list_summary_strategy_ids
# ----------------------------------------------------------------------
def test_list_summary_strategy_ids_returns_empty_when_dir_missing(
    tmp_path: Path,
) -> None:
    """summaries ディレクトリ自体が無いときは空リスト。"""
    db_path = _make_db_with_backtest(tmp_path)
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")
    assert repo.list_summary_strategy_ids() == []


def test_list_summary_strategy_ids_returns_sorted_ids(tmp_path: Path) -> None:
    """summary ファイル名から ID を抽出してソートして返す。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    _seed_summary(live_dir, "zeta", {})
    _seed_summary(live_dir, "alpha", {})
    _seed_summary(live_dir, "mid", {})
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    assert repo.list_summary_strategy_ids() == ["alpha", "mid", "zeta"]


# ----------------------------------------------------------------------
# load_summary
# ----------------------------------------------------------------------
def test_load_summary_returns_dict(tmp_path: Path) -> None:
    """正常な summary を辞書で返す。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    _seed_summary(live_dir, "s", {"strategy_id": "s", "total_trades": 3})
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    summary = repo.load_summary("s")
    assert summary == {"strategy_id": "s", "total_trades": 3}


def test_load_summary_returns_none_for_missing(tmp_path: Path) -> None:
    """summary ファイルが無ければ None。"""
    db_path = _make_db_with_backtest(tmp_path)
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")
    assert repo.load_summary("absent") is None


def test_load_summary_returns_none_for_non_dict_root(tmp_path: Path) -> None:
    """JSON ルートが dict でないときは None（list / 文字列など）。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    summaries_dir = live_dir / "summaries"
    summaries_dir.mkdir(parents=True)
    (summaries_dir / "weird.live.summary.json").write_text("[1, 2, 3]", encoding="utf-8")
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    assert repo.load_summary("weird") is None


# ----------------------------------------------------------------------
# load_raw_trades
# ----------------------------------------------------------------------
def test_load_raw_trades_returns_empty_for_missing(tmp_path: Path) -> None:
    """trades ファイルが無ければ空リスト。"""
    db_path = _make_db_with_backtest(tmp_path)
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")
    assert repo.load_raw_trades("absent") == []


def test_load_raw_trades_handles_list_root(tmp_path: Path) -> None:
    """JSON ルートが list ならそのまま返す（dict 以外の要素は除外）。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    _seed_trades(live_dir, "s", [{"trade_id": "t1"}, "garbage", {"trade_id": "t2"}])
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    items = repo.load_raw_trades("s")
    assert items == [{"trade_id": "t1"}, {"trade_id": "t2"}]


def test_load_raw_trades_handles_dict_root_with_trades_key(tmp_path: Path) -> None:
    """JSON ルートが dict なら ``trades`` キー配下のリストを採用する。"""
    db_path = _make_db_with_backtest(tmp_path)
    live_dir = tmp_path / "live"
    _seed_trades(live_dir, "s", {"trades": [{"trade_id": "t1"}], "meta": "x"})
    repo = LiveDataRepository(get_engine(db_path), live_dir=live_dir)

    items = repo.load_raw_trades("s")
    assert items == [{"trade_id": "t1"}]


# ----------------------------------------------------------------------
# fetch_backtest_for_diff
# ----------------------------------------------------------------------
def test_fetch_backtest_for_diff_returns_latest_when_run_id_none(
    tmp_path: Path,
) -> None:
    """run_id 未指定時は run_at 降順 1 件目（最新）を返す。"""
    db_path = _make_db_with_backtest(tmp_path)
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")

    row = repo.fetch_backtest_for_diff("strat_x", None)
    assert isinstance(row, BacktestResultRow)
    assert row.run_id == "new_run"


def test_fetch_backtest_for_diff_returns_specified_run(tmp_path: Path) -> None:
    """run_id 指定時はその ID を返す。"""
    db_path = _make_db_with_backtest(tmp_path)
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")

    row = repo.fetch_backtest_for_diff("strat_x", "old_run")
    assert isinstance(row, BacktestResultRow)
    assert row.run_id == "old_run"


def test_fetch_backtest_for_diff_returns_none_for_missing_strategy(
    tmp_path: Path,
) -> None:
    """対応するレコードが無いときは None。"""
    db_path = _make_db_with_backtest(tmp_path)
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")

    assert repo.fetch_backtest_for_diff("does_not_exist", None) is None
    assert repo.fetch_backtest_for_diff("strat_x", "missing_run") is None


def test_fetch_backtest_for_diff_propagates_when_table_missing(
    tmp_path: Path,
) -> None:
    """テーブルが存在しない DB では OperationalError が伝播する（Router 側で try/except）。"""
    db_path = tmp_path / "empty.db"
    db_path.touch()
    repo = LiveDataRepository(get_engine(db_path), live_dir=tmp_path / "live")

    with pytest.raises(OperationalError):
        repo.fetch_backtest_for_diff("any", None)
