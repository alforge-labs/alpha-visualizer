"""live ルーターのテスト（issue #57: ライブ実績 API）。"""

from __future__ import annotations

import pathlib

from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import (
    build_backtest_db,
    seed_backtest_with_trades,
    seed_live_summary,
    seed_live_trades,
)


class TestLiveRouter:
    """ライブ実績 API のテスト（issue #57）"""

    def test_list_live_no_dir(self, client: TestClient) -> None:
        """data/live が無いときは空リストを返す"""
        response = client.get("/api/live")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_live_with_summary_only(self, tmp_path: pathlib.Path) -> None:
        """summary のみ存在する戦略が一覧に出る"""
        seed_live_summary(
            tmp_path / "data" / "live",
            "strat_a",
            {"strategy_id": "strat_a", "total_trades": 0, "symbols": []},
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live")
        assert response.status_code == 200
        data = response.json()
        assert data == [
            {"strategy_id": "strat_a", "has_summary": True, "has_trades": False}
        ]

    def test_list_live_includes_trades_flag(self, tmp_path: pathlib.Path) -> None:
        """trades ファイルがあれば has_trades=True"""
        live_dir = tmp_path / "data" / "live"
        seed_live_summary(live_dir, "strat_b", {"strategy_id": "strat_b"})
        seed_live_trades(live_dir, "strat_b", [])
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live")
        assert response.status_code == 200
        data = response.json()
        assert data == [
            {"strategy_id": "strat_b", "has_summary": True, "has_trades": True}
        ]

    def test_get_live_not_found(self, client: TestClient) -> None:
        """summary が無ければ 404"""
        response = client.get("/api/live/missing")
        assert response.status_code == 404

    def test_get_live_summary_only_no_trades_no_backtest(
        self, tmp_path: pathlib.Path
    ) -> None:
        """summary だけ存在するときは trades 空、period/backtest/diff は null。warnings を含む。"""
        seed_live_summary(
            tmp_path / "data" / "live",
            "strat_c",
            {
                "strategy_id": "strat_c",
                "total_trades": 5,
                "win_rate_pct": 60.0,
                "profit_factor": 1.5,
                "max_drawdown_pct": -3.0,
                "net_pnl": 1000.0,
                "symbols": ["AAPL"],
            },
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/strat_c")
        assert response.status_code == 200
        body = response.json()
        assert body["strategy_id"] == "strat_c"
        assert body["live"]["summary"]["strategy_id"] == "strat_c"
        assert body["live"]["trades"] == []
        assert body["live"]["period"] is None
        assert body["backtest"] is None
        assert body["diff"] is None
        assert any("trade" in w for w in body["warnings"])

    def test_get_live_with_period_and_aligned_diff(
        self, tmp_path: pathlib.Path
    ) -> None:
        """live trades と backtest trades の両方があるとき、period 整合 diff が計算される。"""
        live_dir = tmp_path / "data" / "live"
        seed_live_summary(
            live_dir,
            "strat_d",
            {
                "strategy_id": "strat_d",
                "total_trades": 3,
                "win_rate_pct": 66.6667,
                "profit_factor": 2.0,
                "max_drawdown_pct": -1.0,
                "net_pnl": 200.0,
                "symbols": ["AAPL"],
            },
        )
        seed_live_trades(
            live_dir,
            "strat_d",
            [
                {
                    "trade_id": "t1",
                    "symbol": "AAPL",
                    "side": "long",
                    "entry_at": "2026-04-01T09:00:00",
                    "exit_at": "2026-04-02T15:00:00",
                    "qty": 100,
                    "entry_price": 100.0,
                    "exit_price": 101.0,
                    "net_pnl": 100.0,
                    "return_pct": 1.0,
                },
                {
                    "trade_id": "t2",
                    "symbol": "AAPL",
                    "side": "long",
                    "entry_at": "2026-04-15T10:00:00",
                    "exit_at": "2026-04-16T15:00:00",
                    "qty": 100,
                    "entry_price": 102.0,
                    "exit_price": 100.0,
                    "net_pnl": -200.0,
                    "return_pct": -2.0,
                },
                {
                    "trade_id": "t3",
                    "symbol": "AAPL",
                    "side": "long",
                    "entry_at": "2026-04-25T09:00:00",
                    "exit_at": "2026-04-30T15:00:00",
                    "qty": 100,
                    "entry_price": 100.0,
                    "exit_price": 103.0,
                    "net_pnl": 300.0,
                    "return_pct": 3.0,
                },
            ],
        )

        # forge.db に backtest_results を作る。trades は live と同じ期間に
        # 重なるもの 2 件 + 期間外 1 件を入れる。
        db_path = tmp_path / "data" / "results" / "forge.db"
        build_backtest_db(db_path)
        # 既存の挿入レコードはそのまま、新規の strat_d 用を追加
        seed_backtest_with_trades(
            db_path,
            run_id="bt_run_d",
            strategy_id="strat_d",
            run_at="2026-05-01T00:00:00",
            trades=[
                {
                    "exit_date": "2026-04-02",
                    "return_pct": 1.5,
                    "pnl": 150.0,
                },
                {
                    "exit_date": "2026-04-20",
                    "return_pct": -1.0,
                    "pnl": -100.0,
                },
                {
                    "exit_date": "2026-05-15",  # 期間外
                    "return_pct": 5.0,
                    "pnl": 500.0,
                },
            ],
        )

        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/strat_d")
        assert response.status_code == 200
        body = response.json()

        assert body["live"]["period"]["start"] == "2026-04-01T09:00:00"
        assert body["live"]["period"]["end"] == "2026-04-30T15:00:00"
        assert len(body["live"]["trades"]) == 3

        backtest = body["backtest"]
        assert backtest is not None
        assert backtest["run_id"] == "bt_run_d"
        aligned = backtest["aligned"]
        # 期間内の 2 件のみ集計（500 PnL のものは期間外で除外）
        assert aligned["total_trades"] == 2
        assert aligned["win_rate_pct"] == 50.0
        assert aligned["net_pnl"] == 50.0  # 150 + (-100)

        diff = body["diff"]
        assert diff is not None
        assert diff["total_trades"] == 1  # 3 - 2
        assert diff["net_pnl"] == 150.0  # 200 - 50

    def test_get_live_with_run_id_query(self, tmp_path: pathlib.Path) -> None:
        """run_id クエリで指定した backtest run が選ばれる"""
        live_dir = tmp_path / "data" / "live"
        seed_live_summary(live_dir, "strat_e", {"strategy_id": "strat_e"})
        seed_live_trades(
            live_dir,
            "strat_e",
            [
                {
                    "trade_id": "t1",
                    "symbol": "AAPL",
                    "side": "long",
                    "entry_at": "2026-04-01T09:00:00",
                    "exit_at": "2026-04-02T15:00:00",
                    "qty": 100,
                    "entry_price": 100.0,
                    "exit_price": 101.0,
                    "net_pnl": 100.0,
                    "return_pct": 1.0,
                }
            ],
        )

        db_path = tmp_path / "data" / "results" / "forge.db"
        build_backtest_db(db_path)
        seed_backtest_with_trades(
            db_path,
            run_id="older_run",
            strategy_id="strat_e",
            run_at="2026-03-01T00:00:00",
            trades=[{"exit_date": "2026-04-02", "return_pct": 0.5, "pnl": 50.0}],
        )
        seed_backtest_with_trades(
            db_path,
            run_id="newer_run",
            strategy_id="strat_e",
            run_at="2026-04-30T00:00:00",
            trades=[{"exit_date": "2026-04-02", "return_pct": 1.0, "pnl": 100.0}],
        )

        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/strat_e?run_id=older_run")
        assert response.status_code == 200
        body = response.json()
        assert body["backtest"]["run_id"] == "older_run"
        assert body["backtest"]["aligned"]["net_pnl"] == 50.0

    def test_get_live_invalid_summary_json(self, tmp_path: pathlib.Path) -> None:
        """壊れた JSON は 404 として扱う"""
        summaries_dir = tmp_path / "data" / "live" / "summaries"
        summaries_dir.mkdir(parents=True)
        (summaries_dir / "broken.live.summary.json").write_text(
            "{not-json", encoding="utf-8"
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/broken")
        assert response.status_code == 404

    def test_get_live_no_backtest_run(self, tmp_path: pathlib.Path) -> None:
        """対応する backtest run が無いときは backtest=null + warning"""
        live_dir = tmp_path / "data" / "live"
        seed_live_summary(live_dir, "strat_f", {"strategy_id": "strat_f"})
        seed_live_trades(
            live_dir,
            "strat_f",
            [
                {
                    "trade_id": "t1",
                    "symbol": "AAPL",
                    "side": "long",
                    "entry_at": "2026-04-01T09:00:00",
                    "exit_at": "2026-04-02T15:00:00",
                    "qty": 100,
                    "entry_price": 100.0,
                    "exit_price": 101.0,
                    "net_pnl": 100.0,
                    "return_pct": 1.0,
                }
            ],
        )
        # forge.db は作らない
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/strat_f")
        assert response.status_code == 200
        body = response.json()
        assert body["backtest"] is None
        assert body["diff"] is None
        assert any("backtest" in w for w in body["warnings"])
