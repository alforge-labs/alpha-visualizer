"""ルーターエンドポイントのテスト（forge.db 不在時の挙動・forge.yaml 反映）"""

import json
import pathlib
import sqlite3
import textwrap
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig


@pytest.fixture()
def client(tmp_path: pathlib.Path) -> TestClient:
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


@pytest.fixture()
def client_with_strategies(tmp_path: pathlib.Path) -> TestClient:
    strategies_dir = tmp_path / "data" / "strategies"
    strategies_dir.mkdir(parents=True)
    (strategies_dir / "test_strategy.json").write_text(
        json.dumps(
            {
                "strategy_id": "test_strategy",
                "name": "テスト戦略",
                "timeframe": "1h",
                "parameters": {"period": 20},
            }
        ),
        encoding="utf-8",
    )
    ideas_dir = tmp_path / "data" / "ideas"
    ideas_dir.mkdir(parents=True)
    (ideas_dir / "ideas.json").write_text(
        json.dumps([{"idea_id": "idea_001", "title": "テストアイデア", "status": "pending"}]),
        encoding="utf-8",
    )
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


class TestResultsRouter:
    def test_list_results_empty_db(self, client: TestClient) -> None:
        """forge.db が存在しない場合は空リストを返す"""
        response = client.get("/api/results")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_results_with_strategy_filter(self, client: TestClient) -> None:
        """strategy_id クエリパラメータ付きで空リストを返す"""
        response = client.get("/api/results?strategy_id=some_strategy")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_results_since_invalid(self, client: TestClient) -> None:
        """since パラメータが不正な場合は 400 を返す"""
        response = client.get("/api/results?since=not-a-date")
        assert response.status_code == 400

    def test_get_result_not_found(self, client: TestClient) -> None:
        """forge.db が存在しない場合は 404 を返す"""
        response = client.get("/api/results/nonexistent_run")
        assert response.status_code == 404


class TestStrategiesRouter:
    def test_list_strategies_no_dir(self, client: TestClient) -> None:
        """strategies_dir が存在しない場合は空リストを返す"""
        response = client.get("/api/strategies")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_strategies_with_files(self, client_with_strategies: TestClient) -> None:
        """strategies_dir に JSON ファイルがある場合はリストを返す。
        timeframe は戦略 JSON から取得され、バックテスト履歴がない latest_* は null。"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        item = data[0]
        assert item["strategy_id"] == "test_strategy"
        assert item["name"] == "テスト戦略"
        assert item["timeframe"] == "1h"
        # バックテスト履歴がないので latest_* は null
        assert item["symbol"] is None
        assert item["latest_sharpe"] is None
        assert item["latest_max_drawdown_pct"] is None
        assert item["latest_profit_factor"] is None
        assert item["latest_win_rate_pct"] is None

    def test_get_strategy_not_found(self, client: TestClient) -> None:
        """存在しない strategy_id は 404 を返す"""
        response = client.get("/api/strategies/nonexistent")
        assert response.status_code == 404

    def test_get_strategy_found(self, client_with_strategies: TestClient) -> None:
        """存在する strategy_id は詳細を返す"""
        response = client_with_strategies.get("/api/strategies/test_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["strategy_id"] == "test_strategy"
        assert data["parameters"]["period"] == 20

    def test_compare_strategies_empty_ids(self, client: TestClient) -> None:
        """ids が空の場合は 400 を返す"""
        response = client.get("/api/strategies/compare?ids=")
        assert response.status_code == 400

    def test_compare_strategies_not_found(self, client: TestClient) -> None:
        """バックテスト結果がない場合は 404 を返す"""
        response = client.get("/api/strategies/compare?ids=nonexistent")
        assert response.status_code == 404


class TestIdeasRouter:
    def test_list_ideas_no_file(self, client: TestClient) -> None:
        """ideas.json が存在しない場合は空リストを返す"""
        response = client.get("/api/ideas")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_ideas_with_data(self, client_with_strategies: TestClient) -> None:
        """ideas.json が存在する場合はリストを返す"""
        response = client_with_strategies.get("/api/ideas")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["idea_id"] == "idea_001"

    def test_list_ideas_status_filter(self, client_with_strategies: TestClient) -> None:
        """status フィルターが動作する"""
        response = client_with_strategies.get("/api/ideas?status=pending")
        assert response.status_code == 200
        assert len(response.json()) == 1

        response2 = client_with_strategies.get("/api/ideas?status=done")
        assert response2.status_code == 200
        assert len(response2.json()) == 0

    def test_get_idea_not_found(self, client: TestClient) -> None:
        """存在しない idea_id は 404 を返す"""
        response = client.get("/api/ideas/nonexistent")
        assert response.status_code == 404

    def test_get_idea_found(self, client_with_strategies: TestClient) -> None:
        """存在する idea_id は詳細を返す"""
        response = client_with_strategies.get("/api/ideas/idea_001")
        assert response.status_code == 200
        data = response.json()
        assert data["idea_id"] == "idea_001"


class TestWfoRouter:
    def test_wfo_no_db(self, client: TestClient) -> None:
        """forge.db が存在しない場合は 404 を返す"""
        response = client.get("/api/wfo/some_strategy")
        assert response.status_code == 404


# --- forge.yaml 反映 + 実 DB ありのテスト ----------------------------------


def _create_backtest_db(db_path: pathlib.Path) -> None:
    """alpha-forge と互換のスキーマで最小の backtest_results.db を作る。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE backtest_results (
                id INTEGER PRIMARY KEY,
                run_id TEXT NOT NULL UNIQUE,
                strategy_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                run_at TEXT NOT NULL,
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
                metrics_json TEXT NOT NULL,
                equity_curve_json TEXT,
                trades_json TEXT,
                oos_start TEXT,
                buy_hold_curve_json TEXT
            );
            CREATE TABLE optimization_runs (
                id INTEGER PRIMARY KEY,
                run_id TEXT NOT NULL UNIQUE,
                strategy_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                run_at TEXT NOT NULL,
                n_trials INTEGER,
                best_metric_name TEXT,
                best_metric_value REAL,
                best_params_json TEXT,
                duration_seconds REAL,
                all_trials_json TEXT
            );
            """
        )
        conn.execute(
            """
            INSERT INTO backtest_results (
                run_id, strategy_id, symbol, run_at,
                total_return_pct, sharpe_ratio, max_drawdown_pct, total_trades,
                profit_factor, win_rate_pct,
                metrics_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "run_aapl_001",
                "ema_cross_aapl",
                "AAPL",
                "2026-04-01T12:00:00",
                12.5,
                1.42,
                -8.3,
                42,
                1.86,
                63.2,
                "{}",
            ),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture()
def client_with_db(tmp_path: pathlib.Path) -> TestClient:
    """backtest_results.db に1件の run が入った状態のクライアント"""
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _create_backtest_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at,"
            " total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,"
            " profit_factor, total_trades, metrics_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "run-abc123",
                "test_strategy",
                "AAPL",
                "2026-01-01T00:00:00",
                10.0,
                1.5,
                -5.0,
                60.0,
                1.8,
                50,
                "{}",
            ),
        )
    forge_yaml = tmp_path / "forge.yaml"
    forge_yaml.write_text(
        "report:\n  db_filename: backtest_results.db\n"
        "  output_path: ./data/results\n"
    )
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


def _create_strategies_db(db_path: pathlib.Path, strategy_id: str, name: str) -> None:
    """alpha-forge と互換のスキーマで最小の strategies.db を作る。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE strategies (
                id INTEGER PRIMARY KEY,
                strategy_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                tags TEXT NOT NULL,
                notes TEXT NOT NULL,
                definition_json TEXT NOT NULL,
                source_file TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        definition = json.dumps(
            {
                "strategy_id": strategy_id,
                "name": name,
                "parameters": {"fast": 12, "slow": 26},
            }
        )
        conn.execute(
            """
            INSERT INTO strategies (
                strategy_id, name, version, asset_type, timeframe,
                tags, notes, definition_json,
                created_at, updated_at
            ) VALUES (?, ?, '1.0.0', 'stock', '1d', '[]', '', ?, '2026-04-01', '2026-04-01')
            """,
            (strategy_id, name, definition),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture()
def client_with_forge_yaml(tmp_path: pathlib.Path) -> TestClient:
    """forge.yaml + 実 SQLite DB（backtest_results / strategies）を持つクライアント。"""
    _create_backtest_db(tmp_path / "data" / "results" / "backtest_results.db")
    _create_strategies_db(
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


class TestStrategiesRouterJsonFallback:
    def test_json_mode_still_works_without_yaml(
        self, client_with_strategies: TestClient
    ) -> None:
        """forge.yaml が無いとき従来通り JSON glob から戦略を読む"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["strategy_id"] == "test_strategy"


class TestRunRouter:
    def test_run_success(self, client_with_db: TestClient) -> None:
        """forge コマンドが成功したとき run_id と status="ok" を返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL", "timeframe": "1d"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["run_id"] == "run-abc123"
        assert body["status"] == "ok"

    def test_run_forge_not_found(self, client_with_db: TestClient) -> None:
        """forge コマンドが PATH にないとき 500 を返す"""
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL", "timeframe": "1d"},
            )
        assert resp.status_code == 500
        assert "forge" in resp.json()["detail"].lower()

    def test_run_subprocess_failure(self, client_with_db: TestClient) -> None:
        """forge コマンドが非ゼロで終了したとき 500 を返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=mock.Mock(
                    returncode=1, stdout="", stderr="Error: strategy not found"
                ),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL", "timeframe": "1d"},
            )
        assert resp.status_code == 500
        assert "Error: strategy not found" in resp.json()["detail"]
