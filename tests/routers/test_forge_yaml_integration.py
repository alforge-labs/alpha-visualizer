"""forge.yaml と実 SQLite DB を組み合わせた統合テスト。"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import textwrap

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from tests.factories import build_backtest_db, build_strategies_db


@pytest.fixture()
def client_with_forge_yaml(tmp_path: pathlib.Path) -> TestClient:
    """forge.yaml + 実 SQLite DB（backtest_results / strategies）を持つクライアント。"""
    build_backtest_db(tmp_path / "data" / "results" / "backtest_results.db")
    build_strategies_db(
        tmp_path / "data" / "strategies" / "strategies.db",
        strategy_id="ema_cross_aapl",
        name="EMA クロス AAPL",
    )
    (tmp_path / "forge.yaml").write_text(
        textwrap.dedent(
            """
            report:
              output_path: ./data/results
              db_filename: backtest_results.db
            strategies:
              path: ./data/strategies
              use_db: true
              db_filename: strategies.db
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    config = ForgeConfig.from_forge_dir(tmp_path)
    app = create_app(config=config)
    return TestClient(app)


class TestForgeYamlIntegration:
    def test_list_results_returns_real_data(
        self, client_with_forge_yaml: TestClient
    ) -> None:
        """forge.yaml の report.db_filename を反映して /api/results が実データを返す"""
        response = client_with_forge_yaml.get("/api/results")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["run_id"] == "run_aapl_001"
        assert data[0]["strategy_id"] == "ema_cross_aapl"

    def test_list_strategies_uses_db(
        self, client_with_forge_yaml: TestClient
    ) -> None:
        """strategies.use_db: true で strategies.db から戦略一覧を返す。
        symbol / timeframe / max_drawdown / profit_factor / win_rate も含む。"""
        response = client_with_forge_yaml.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        item = data[0]
        assert item["strategy_id"] == "ema_cross_aapl"
        assert item["name"] == "EMA クロス AAPL"
        assert item["symbol"] == "AAPL"
        assert item["timeframe"] == "1d"
        assert item["latest_sharpe"] == pytest.approx(1.42)
        assert item["latest_return_pct"] == pytest.approx(12.5)
        assert item["latest_max_drawdown_pct"] == pytest.approx(-8.3)
        assert item["latest_profit_factor"] == pytest.approx(1.86)
        assert item["latest_win_rate_pct"] == pytest.approx(63.2)
        assert item["latest_total_trades"] == 42

    def test_get_strategy_uses_db(
        self, client_with_forge_yaml: TestClient
    ) -> None:
        """戦略詳細も strategies.db から取得される"""
        response = client_with_forge_yaml.get("/api/strategies/ema_cross_aapl")
        assert response.status_code == 200
        data = response.json()
        assert data["strategy_id"] == "ema_cross_aapl"
        assert data["parameters"] == {"fast": 12, "slow": 26}

    def test_compare_strategies_uses_db(
        self, client_with_forge_yaml: TestClient
    ) -> None:
        """戦略比較も strategies.db からの戦略名と forge_db からの結果を結合する"""
        response = client_with_forge_yaml.get(
            "/api/strategies/compare?ids=ema_cross_aapl"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "ema_cross_aapl"
        assert data[0]["name"] == "EMA クロス AAPL"
        assert data[0]["sharpe_ratio"] == pytest.approx(1.42)

    def test_compare_strategies_returns_equity_and_daily_returns(
        self, tmp_path: pathlib.Path
    ) -> None:
        """compare API は equity_curve_json をパースして equity と daily_returns を返す（issue #55）"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        build_backtest_db(db_path)
        # equity_curve_json 入りの run を 2 件追加
        equity_a = json.dumps(
            [
                {"date": "2025-01-01", "value": 100.0},
                {"date": "2025-01-02", "value": 101.0},
                {"date": "2025-01-03", "value": 102.0},
                {"date": "2025-01-04", "value": 101.5},
            ]
        )
        equity_b = json.dumps(
            [
                {"date": "2025-01-01", "value": 200.0},
                {"date": "2025-01-02", "value": 198.0},
                {"date": "2025-01-03", "value": 199.5},
                {"date": "2025-01-04", "value": 201.0},
            ]
        )
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "INSERT INTO backtest_results"
                " (run_id, strategy_id, symbol, run_at, total_return_pct,"
                " sharpe_ratio, metrics_json, equity_curve_json)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "run_a",
                    "strat_a",
                    "AAPL",
                    "2026-04-01T12:00:00",
                    1.5,
                    1.0,
                    "{}",
                    equity_a,
                ),
            )
            conn.execute(
                "INSERT INTO backtest_results"
                " (run_id, strategy_id, symbol, run_at, total_return_pct,"
                " sharpe_ratio, metrics_json, equity_curve_json)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "run_b",
                    "strat_b",
                    "AAPL",
                    "2026-04-01T12:00:00",
                    0.5,
                    0.8,
                    "{}",
                    equity_b,
                ),
            )
        build_strategies_db(
            tmp_path / "data" / "strategies" / "strategies.db",
            strategy_id="strat_a",
            name="Strategy A",
        )
        # 2 件目は同一 DB に追加（テーブル再作成は不要）
        with sqlite3.connect(tmp_path / "data" / "strategies" / "strategies.db") as conn:
            conn.execute(
                """
                INSERT INTO strategies (
                    strategy_id, name, version, asset_type, timeframe,
                    tags, notes, definition_json, created_at, updated_at
                ) VALUES (?, ?, '1.0.0', 'stock', '1d', '[]', '', ?, '2026-04-01', '2026-04-01')
                """,
                (
                    "strat_b",
                    "Strategy B",
                    json.dumps({"strategy_id": "strat_b", "name": "Strategy B", "parameters": {}}),
                ),
            )
        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
                report:
                  output_path: ./data/results
                  db_filename: backtest_results.db
                strategies:
                  path: ./data/strategies
                  use_db: true
                  db_filename: strategies.db
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        client = TestClient(create_app(config=config))

        response = client.get(
            "/api/strategies/compare?ids=strat_a,strat_b"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        first = data[0]
        assert first["id"] == "strat_a"
        assert "equity" in first
        assert first["equity"]["dates"] == [
            "2025-01-01",
            "2025-01-02",
            "2025-01-03",
            "2025-01-04",
        ]
        assert first["equity"]["values"] == [100.0, 101.0, 102.0, 101.5]
        assert "daily_returns" in first
        assert len(first["daily_returns"]) == 3
        assert first["daily_returns"][0] == pytest.approx(1.0, abs=1e-3)

        second = data[1]
        assert second["id"] == "strat_b"
        assert second["daily_returns"][0] == pytest.approx(-1.0, abs=1e-3)
