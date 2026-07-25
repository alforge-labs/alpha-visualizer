"""live ルーターのテスト（issue #57 / #209: ライブ実績 API）。

issue #209 で live 実績データ源を JSON ファイルから ``backtest_results.db`` の
SQLite テーブル（live_summaries / live_trades / live_position_summaries）へ
移行した。本テストはその SQLite 直読み経路を検証する。
"""

from __future__ import annotations

import pathlib

from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import (
    build_backtest_db,
    seed_backtest_with_trades,
    seed_live_position_summary,
    seed_live_summary,
    seed_live_trades,
)


def _db_path(tmp_path: pathlib.Path) -> pathlib.Path:
    """forge.yaml デフォルト解決での backtest_results.db パス。"""
    return tmp_path / "data" / "results" / "backtest_results.db"


class TestLiveRouter:
    """ライブ実績 API のテスト（issue #57 / #209）"""

    def test_list_live_no_db(self, client: TestClient) -> None:
        """backtest_results.db が無いときは空リストを返す（engine=None 経路）。"""
        response = client.get("/api/live")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_live_with_summary_only(self, tmp_path: pathlib.Path) -> None:
        """live_summaries にある戦略が kind=strategy で一覧に出る。"""
        seed_live_summary(
            _db_path(tmp_path),
            "strat_a",
            {"strategy_id": "strat_a", "total_trades": 0, "symbols": []},
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live")
        assert response.status_code == 200
        assert response.json() == [
            {
                "strategy_id": "strat_a",
                "has_summary": True,
                "has_trades": False,
                "kind": "strategy",
            }
        ]

    def test_list_live_includes_trades_flag(self, tmp_path: pathlib.Path) -> None:
        """live_trades があれば has_trades=True。"""
        db_path = _db_path(tmp_path)
        seed_live_summary(db_path, "strat_b", {"strategy_id": "strat_b"})
        seed_live_trades(
            db_path,
            "strat_b",
            [
                {
                    "trade_id": "t1",
                    "symbol": "AAPL",
                    "side": "long",
                    "entry_at": "2026-04-01T09:00:00",
                    "exit_at": "2026-04-02T15:00:00",
                }
            ],
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live")
        assert response.status_code == 200
        assert response.json() == [
            {
                "strategy_id": "strat_b",
                "has_summary": True,
                "has_trades": True,
                "kind": "strategy",
            }
        ]

    def test_list_live_includes_position_portfolio(
        self, tmp_path: pathlib.Path
    ) -> None:
        """combine portfolio（position ベース）も kind=position で一覧に出る。"""
        db_path = _db_path(tmp_path)
        seed_live_summary(db_path, "strat_z", {"strategy_id": "strat_z"})
        seed_live_position_summary(
            db_path,
            "combo_port",
            metrics={"sharpe_ratio": 1.2},
            sub_strategies=["strat_z"],
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live")
        assert response.status_code == 200
        data = response.json()
        kinds = {item["strategy_id"]: item["kind"] for item in data}
        assert kinds == {"strat_z": "strategy", "combo_port": "position"}
        combo = next(i for i in data if i["strategy_id"] == "combo_port")
        assert combo["has_trades"] is False

    def test_get_live_not_found(self, client: TestClient) -> None:
        """summary が無ければ 404。"""
        response = client.get("/api/live/missing")
        assert response.status_code == 404

    def test_get_live_summary_only_no_trades_no_backtest(
        self, tmp_path: pathlib.Path
    ) -> None:
        """summary だけあるときは trades 空、period/backtest/diff は null、warnings あり。"""
        seed_live_summary(
            _db_path(tmp_path),
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
        assert body["live"]["summary"]["symbols"] == ["AAPL"]
        assert body["live"]["trades"] == []
        assert body["live"]["period"] is None
        assert body["backtest"] is None
        assert body["diff"] is None
        assert any("trade" in w for w in body["warnings"])

    def test_get_live_with_period_and_aligned_diff(
        self, tmp_path: pathlib.Path
    ) -> None:
        """live trades と backtest trades の両方があるとき、period 整合 diff が計算される。"""
        db_path = _db_path(tmp_path)
        # backtest_results.db を先に作る（live テーブルも同居）
        build_backtest_db(db_path)
        seed_live_summary(
            db_path,
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
            db_path,
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

        # backtest trades は live と同じ期間に重なるもの 2 件 + 期間外 1 件
        seed_backtest_with_trades(
            db_path,
            run_id="bt_run_d",
            strategy_id="strat_d",
            run_at="2026-05-01T00:00:00",
            trades=[
                {"exit_date": "2026-04-02", "return_pct": 1.5, "pnl": 150.0},
                {"exit_date": "2026-04-20", "return_pct": -1.0, "pnl": -100.0},
                {"exit_date": "2026-05-15", "return_pct": 5.0, "pnl": 500.0},
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
        """run_id クエリで指定した backtest run が選ばれる。"""
        db_path = _db_path(tmp_path)
        build_backtest_db(db_path)
        seed_live_summary(db_path, "strat_e", {"strategy_id": "strat_e"})
        seed_live_trades(
            db_path,
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

    def test_get_live_no_backtest_run(self, tmp_path: pathlib.Path) -> None:
        """対応する backtest run が無いときは backtest=null + warning。"""
        db_path = _db_path(tmp_path)
        seed_live_summary(db_path, "strat_f", {"strategy_id": "strat_f"})
        seed_live_trades(
            db_path,
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
        # backtest_results 行は入れない（live テーブルのみ）
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/strat_f")
        assert response.status_code == 200
        body = response.json()
        assert body["backtest"] is None
        assert body["diff"] is None
        assert any("backtest" in w for w in body["warnings"])

    def test_get_live_position_based_summary(self, tmp_path: pathlib.Path) -> None:
        """position ベース portfolio は metrics/equity を summary に載せ、trades 空。"""
        db_path = _db_path(tmp_path)
        seed_live_position_summary(
            db_path,
            "combo_port",
            metrics={"sharpe_ratio": 1.3, "total_return_pct": 8.0},
            equity=[
                ["2026-04-01T00:00:00", 100000.0],
                ["2026-04-02T00:00:00", 101000.0],
            ],
            backtest_metrics={"sharpe_ratio": 1.1},
            receipts_count=2,
            sub_strategies=["strat_x", "strat_y"],
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/combo_port")
        assert response.status_code == 200
        body = response.json()
        summary = body["live"]["summary"]
        assert summary["kind"] == "position"
        assert summary["metrics"]["sharpe_ratio"] == 1.3
        assert summary["backtest_metrics"]["sharpe_ratio"] == 1.1
        assert len(summary["equity"]) == 2
        assert summary["sub_strategies"] == ["strat_x", "strat_y"]
        assert body["live"]["trades"] == []
        assert body["live"]["period"] is None
        assert body["backtest"] is None
        assert body["diff"] is None
        assert any("position" in w for w in body["warnings"])

    def test_get_live_position_summary_includes_equity_comparison_fields(
        self, tmp_path: pathlib.Path
    ) -> None:
        """DB → Repository → services.position_detail → API を貫通する統合テスト。

        issue #221 (task-14) の統合ギャップ回帰テスト: benchmark_equity /
        backtest_equity / positions は Repository が正しくパースし、React
        コンポーネントも props さえ受け取れば正しく描画できることは単体
        テストで検証済みだった。しかし ``services/live.py::position_detail``
        が明示的な key whitelist で summary dict を組み立てており、そこに
        この 3 フィールド（と cash / total_value）が列挙されていなかった
        ため、各層の単体テストは全て green のまま、実機の
        ``GET /api/live/{portfolio_id}`` からはこれらが丸ごと消えていた
        （excess-return KPI・建玉テーブルが描画されない不具合）。単体テスト
        だけでは検知できず、DB シードから HTTP レスポンスまでを 1 本で
        通すテストが必要だった。
        """
        db_path = _db_path(tmp_path)
        seed_live_position_summary(
            db_path,
            "combo_rich",
            metrics={"sharpe_ratio": 1.4},
            benchmark_equity=[["2026-04-01T00:00:00+00:00", 100000.0]],
            backtest_equity=[["2026-04-01T00:00:00+00:00", 99500.0]],
            positions=[
                {
                    "ticker": "US.TQQQ",
                    "sub_strategy_id": "sub_a",
                    "qty": 10.0,
                    "avg_cost": 50.0,
                    "last_price": 55.0,
                    "market_value": 550.0,
                    "weight_pct": 0.55,
                    "unrealized_pnl": 50.0,
                    "unrealized_pnl_pct": 10.0,
                }
            ],
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/combo_rich")
        assert response.status_code == 200
        summary = response.json()["live"]["summary"]
        assert summary["benchmark_equity"] == [
            ["2026-04-01T00:00:00+00:00", 100000.0]
        ]
        assert summary["backtest_equity"] == [["2026-04-01T00:00:00+00:00", 99500.0]]
        assert summary["positions"][0]["ticker"] == "US.TQQQ"
        # cash / total_value は alpha-forge 側の commands/live.py がまだ
        # PositionLiveSummary に渡していない（DB へ永続化されていない）
        # ため、常に欠損 → 0.0 のデフォルト経路を通る。ここでは「キーが
        # 必ず存在し、欠損時は 0.0 になる」契約を検証する。
        assert summary["cash"] == 0.0
        assert summary["total_value"] == 0.0

    def test_get_live_position_summary_without_new_columns_defaults_empty(
        self, tmp_path: pathlib.Path
    ) -> None:
        """新列 (forge#1332) が NULL の行（旧 DB 相当）でも 200 + 空デフォルト。

        ``--benchmark`` 未使用のまま保存された既存行や、ALTER TABLE 直後で
        まだ新しい ``live replay`` が走っていない行を再現する。欠損値が
        ``None`` のままフロントへ渡ると `.map()` 等でクラッシュし得るため、
        ここで空リスト / 0.0 に丸められることを検証する。
        """
        db_path = _db_path(tmp_path)
        seed_live_position_summary(
            db_path,
            "combo_old",
            metrics={"sharpe_ratio": 1.0},
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/live/combo_old")
        assert response.status_code == 200
        summary = response.json()["live"]["summary"]
        assert summary["benchmark_equity"] == []
        assert summary["backtest_equity"] == []
        assert summary["positions"] == []
        assert summary["cash"] == 0.0
        assert summary["total_value"] == 0.0
