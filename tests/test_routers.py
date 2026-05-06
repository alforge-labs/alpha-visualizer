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

    def test_list_strategies_includes_tags_and_target_symbols(
        self, tmp_path: pathlib.Path
    ) -> None:
        """戦略 JSON に含まれる tags / target_symbols が一覧 API レスポンスに露出される"""
        strategies_dir = tmp_path / "data" / "strategies"
        strategies_dir.mkdir(parents=True)
        (strategies_dir / "tagged.json").write_text(
            json.dumps(
                {
                    "strategy_id": "tagged",
                    "name": "タグ付き戦略",
                    "timeframe": "1h",
                    "tags": ["mean_reversion", "rsi"],
                    "target_symbols": ["TQQQ", "QQQ"],
                }
            ),
            encoding="utf-8",
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["tags"] == ["mean_reversion", "rsi"]
        assert data[0]["target_symbols"] == ["TQQQ", "QQQ"]

    def test_list_strategies_defaults_tags_and_target_symbols_to_empty(
        self, client_with_strategies: TestClient
    ) -> None:
        """tags / target_symbols が戦略 JSON にない場合は空配列で返す"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        item = response.json()[0]
        assert item["tags"] == []
        assert item["target_symbols"] == []

    def test_list_strategies_from_db_parses_tags_text_column(
        self, tmp_path: pathlib.Path
    ) -> None:
        """strategies.db の tags TEXT 列（JSON 文字列）を配列として復元する"""
        db_path = tmp_path / "data" / "strategies" / "strategies.db"
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
                    "strategy_id": "db_tagged",
                    "name": "DB タグ戦略",
                    "target_symbols": ["TQQQ"],
                }
            )
            conn.execute(
                """
                INSERT INTO strategies (
                    strategy_id, name, version, asset_type, timeframe,
                    tags, notes, definition_json,
                    created_at, updated_at
                ) VALUES (
                    'db_tagged', 'DB タグ戦略', '1.0.0', 'stock', '1d',
                    '["momentum","leveraged"]', '', ?, '2026-04-01', '2026-04-01'
                )
                """,
                (definition,),
            )
            conn.commit()
        finally:
            conn.close()

        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
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
        client = TestClient(app)

        response = client.get("/api/strategies")
        assert response.status_code == 200
        item = response.json()[0]
        assert item["strategy_id"] == "db_tagged"
        assert item["tags"] == ["momentum", "leveraged"]
        assert item["target_symbols"] == ["TQQQ"]

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

    def test_get_strategy_found_with_structure(self, tmp_path: pathlib.Path) -> None:
        """戦略構造フィールド（indicators / variables / entry_conditions / exit_conditions /
        risk_management / regime_config）がレスポンスに含まれる"""
        strategies_dir = tmp_path / "data" / "strategies"
        strategies_dir.mkdir(parents=True)
        strategy_def = {
            "strategy_id": "full_strategy",
            "name": "フル戦略",
            "timeframe": "1d",
            "parameters": {"period": 14},
            "indicators": [
                {"id": "rsi", "type": "RSI", "params": {"period": 14}, "lock_on_entry": False}
            ],
            "variables": [{"id": "rsi_val", "expression": "rsi.value"}],
            "entry_conditions": {
                "long": {"type": "AND", "conditions": [{"type": "gt", "left": "rsi_val", "right": 30}]}
            },
            "exit_conditions": {
                "long": {"type": "AND", "conditions": [{"type": "gt", "left": "rsi_val", "right": 70}]}
            },
            "risk_management": {
                "sl_pct": 2.0,
                "tp_pct": 4.0,
                "trailing_stop": False,
                "position_size_pct": 10.0,
                "max_positions": 1,
            },
            "regime_config": {"model": "HMM", "n_states": 2},
        }
        (strategies_dir / "full_strategy.json").write_text(
            json.dumps(strategy_def), encoding="utf-8"
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)

        response = client.get("/api/strategies/full_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["indicators"] == strategy_def["indicators"]
        assert data["variables"] == strategy_def["variables"]
        assert data["entry_conditions"] == strategy_def["entry_conditions"]
        assert data["exit_conditions"] == strategy_def["exit_conditions"]
        assert data["risk_management"] == strategy_def["risk_management"]
        assert data["regime_config"] == strategy_def["regime_config"]

    def test_get_strategy_structure_missing_fields_returns_defaults(
        self, client_with_strategies: TestClient
    ) -> None:
        """戦略定義に構造フィールドがない場合はデフォルト値（空）を返す"""
        response = client_with_strategies.get("/api/strategies/test_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["indicators"] == []
        assert data["variables"] == []
        assert data["entry_conditions"] is None
        assert data["exit_conditions"] is None
        assert data["risk_management"] is None
        assert data["regime_config"] is None

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

    def _setup_wfo_db(self, tmp_path: pathlib.Path, with_equity: bool = True) -> None:
        """WFO テスト用 DB と forge.yaml を作成する。"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        _create_backtest_db(db_path)
        _seed_wfo_windows(db_path)
        if with_equity:
            _seed_oos_equity_curves(db_path)
        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
                report:
                  output_path: ./data/results
                  db_filename: backtest_results.db
                """
            ).strip()
        )

    def test_wfo_composite_from_backtest_results(self, tmp_path: pathlib.Path) -> None:
        """backtest_results の equity_curve_json から composite curve が構築される。"""
        self._setup_wfo_db(tmp_path, with_equity=True)

        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/wfo/wfo_strategy")

        assert response.status_code == 200
        data = response.json()
        eq = data["composite_equity"]
        dates = data["composite_dates"]

        assert len(eq) > 0
        assert len(eq) == len(dates)
        assert abs(eq[0] - 100.0) < 1e-6
        assert all(d1 <= d2 for d1, d2 in zip(dates, dates[1:], strict=False))

    def test_wfo_composite_fallback_to_return_pct(self, tmp_path: pathlib.Path) -> None:
        """backtest_results が無い場合は oos_return_pct から線形補間される。"""
        self._setup_wfo_db(tmp_path, with_equity=False)

        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/wfo/wfo_strategy")

        assert response.status_code == 200
        data = response.json()
        eq = data["composite_equity"]
        dates = data["composite_dates"]

        assert len(eq) > 0
        assert len(eq) == len(dates)
        assert abs(eq[0] - 100.0) < 1e-6
        w1_end_idx = len([d for d in dates if d <= "2021-12-31"]) - 1
        assert abs(eq[w1_end_idx] - 108.0) < 0.5

    def test_wfo_composite_continuous_across_windows(self, tmp_path: pathlib.Path) -> None:
        """ウィンドウ境界で composite curve が連続している。"""
        self._setup_wfo_db(tmp_path, with_equity=True)

        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/wfo/wfo_strategy")

        data = response.json()
        eq = data["composite_equity"]
        dates = data["composite_dates"]

        w1_end_idx = next(i for i, d in enumerate(dates) if d >= "2022-07-01") - 1
        w2_start_idx = w1_end_idx + 1
        assert w1_end_idx >= 0 and w2_start_idx < len(eq)
        assert abs(eq[w1_end_idx] - eq[w2_start_idx]) < 1e-6

    def test_wfo_composite_empty_when_no_oos_dates(self, tmp_path: pathlib.Path) -> None:
        """oos_start が空のウィンドウのみの場合、composite は空配列を返す。"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        _create_backtest_db(db_path)
        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
                report:
                  output_path: ./data/results
                  db_filename: backtest_results.db
                """
            ).strip()
        )

        bad_windows = [
            {
                "window_id": 1,
                "is_sharpe": 1.0,
                "oos_start": "",
                "oos_end": "",
                "oos_return_pct": 5.0,
            }
        ]
        conn = sqlite3.connect(db_path)
        conn.execute(
            """INSERT INTO optimization_runs
               (run_id, strategy_id, symbol, run_at, n_trials, best_metric_name,
                best_metric_value, best_params_json, all_trials_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "opt_bad",
                "bad_strat",
                "AAPL",
                "2026-01-01T00:00:00",
                10,
                "sharpe_ratio",
                1.0,
                "{}",
                json.dumps(bad_windows),
            ),
        )
        conn.commit()
        conn.close()

        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/wfo/bad_strat")

        assert response.status_code == 200
        data = response.json()
        assert data["composite_equity"] == []
        assert data["composite_dates"] == []


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


def _seed_wfo_windows(db_path: pathlib.Path, strategy_id: str = "wfo_strategy") -> None:
    """optimization_runs に WFO ウィンドウ形式の all_trials_json を挿入する。"""
    conn = sqlite3.connect(db_path)
    windows = [
        {
            "window_id": 1,
            "label": "W1",
            "is_start": "2021-01-04",
            "is_end": "2021-06-30",
            "oos_start": "2021-07-01",
            "oos_end": "2021-12-31",
            "is_sharpe": 1.2,
            "oos_sharpe": 0.9,
            "is_return_pct": 12.0,
            "oos_return_pct": 8.0,
            "pass": True,
        },
        {
            "window_id": 2,
            "label": "W2",
            "is_start": "2022-01-03",
            "is_end": "2022-06-30",
            "oos_start": "2022-07-01",
            "oos_end": "2022-12-30",
            "is_sharpe": 1.1,
            "oos_sharpe": 0.7,
            "is_return_pct": 10.0,
            "oos_return_pct": 5.0,
            "pass": True,
        },
    ]
    conn.execute(
        """INSERT INTO optimization_runs
           (run_id, strategy_id, symbol, run_at, n_trials,
            best_metric_name, best_metric_value, best_params_json, all_trials_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "opt_wfo_001",
            strategy_id,
            "AAPL",
            "2026-01-01T00:00:00",
            50,
            "sharpe_ratio",
            0.9,
            "{}",
            json.dumps(windows),
        ),
    )
    conn.commit()
    conn.close()


def _seed_oos_equity_curves(db_path: pathlib.Path, strategy_id: str = "wfo_strategy") -> None:
    """backtest_results に OOS 期間付きエクイティカーブを挿入する（各 WFO ウィンドウ対応）。"""
    import datetime

    def _make_curve(start_date: str, n_days: int, start_val: float, return_pct: float) -> str:
        base = datetime.date.fromisoformat(start_date)
        end_val = start_val * (1 + return_pct / 100)
        curve = []
        for i in range(n_days):
            d = base + datetime.timedelta(days=i)
            v = start_val + (end_val - start_val) * (i / max(n_days - 1, 1))
            curve.append({"date": d.isoformat(), "value": round(v, 4)})
        return json.dumps(curve)

    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO backtest_results
           (run_id, strategy_id, symbol, run_at, metrics_json, equity_curve_json, oos_start)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            "bt_wfo_w1",
            strategy_id,
            "AAPL",
            "2026-01-01T00:00:00",
            "{}",
            _make_curve("2021-07-01", 184, 100000.0, 8.0),
            "2021-07-01",
        ),
    )
    conn.execute(
        """INSERT INTO backtest_results
           (run_id, strategy_id, symbol, run_at, metrics_json, equity_curve_json, oos_start)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            "bt_wfo_w2",
            strategy_id,
            "AAPL",
            "2026-01-01T00:00:01",
            "{}",
            _make_curve("2022-07-01", 183, 100000.0, 5.0),
            "2022-07-01",
        ),
    )
    conn.commit()
    conn.close()


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

    def test_compare_strategies_returns_equity_and_daily_returns(
        self, tmp_path: pathlib.Path
    ) -> None:
        """compare API は equity_curve_json をパースして equity と daily_returns を返す（issue #55）"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        _create_backtest_db(db_path)
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
        _create_strategies_db(
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


# ---------------------------------------------------------------------------
# ベンチマーク指標のパススルーテスト
# ---------------------------------------------------------------------------

_BENCHMARK_METRICS_JSON = json.dumps(
    {
        "total_return_pct": 15.0,
        "sharpe_ratio": 1.2,
        "benchmark": {
            "alpha_pct": 3.5,
            "beta": 0.85,
            "information_ratio": 0.72,
            "correlation": 0.91,
            "benchmark_total_return_pct": 11.5,
            "benchmark_cagr_pct": 5.2,
        },
    }
)


@pytest.fixture()
def client_with_benchmark_db(tmp_path: pathlib.Path) -> TestClient:
    """metrics_json に benchmark サブオブジェクトを含む run が入った状態のクライアント"""
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True)
    _create_backtest_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at,"
            " total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,"
            " profit_factor, total_trades, metrics_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "run-bench01",
                "bench_strategy",
                "SPY",
                "2026-01-01T00:00:00",
                15.0,
                1.2,
                -8.0,
                62.0,
                1.9,
                40,
                _BENCHMARK_METRICS_JSON,
            ),
        )
    forge_yaml = tmp_path / "forge.yaml"
    forge_yaml.write_text(
        "report:\n  db_filename: backtest_results.db\n"
        "  output_path: ./data/results\n"
    )
    return TestClient(create_app(forge_dir=tmp_path))


class TestBenchmarkMetrics:
    def test_get_result_includes_benchmark(self, client_with_benchmark_db: TestClient) -> None:
        """benchmark を含む metrics_json を持つ run の詳細 API が benchmark を返す"""
        response = client_with_benchmark_db.get("/api/results/run-bench01")
        assert response.status_code == 200
        data = response.json()
        bm = data["metrics"]["benchmark"]
        assert bm["alpha_pct"] == pytest.approx(3.5)
        assert bm["beta"] == pytest.approx(0.85)
        assert bm["information_ratio"] == pytest.approx(0.72)
        assert bm["correlation"] == pytest.approx(0.91)
        assert bm["benchmark_total_return_pct"] == pytest.approx(11.5)
        assert bm["benchmark_cagr_pct"] == pytest.approx(5.2)

    def test_get_result_without_benchmark_is_safe(self, client_with_db: TestClient) -> None:
        """benchmark を持たない旧 run でも 200 を返し、metrics に benchmark キーが存在しない"""
        response = client_with_db.get("/api/results/run-abc123")
        assert response.status_code == 200
        data = response.json()
        assert "benchmark" not in data["metrics"]


# ── annual_returns ─────────────────────────────────────────────────────────────

_ANNUAL_RETURNS_METRICS_JSON = json.dumps(
    {
        "total_return_pct": 10.0,
        "sharpe_ratio": 1.1,
        "annual_returns": {"2022": -5.1, "2023": 15.5, "2024": 8.2},
    }
)

_EQUITY_CURVE_WITH_YEARS = json.dumps(
    [
        {"date": "2022-01-03", "value": 100.0},
        {"date": "2022-06-30", "value": 98.0},
        {"date": "2022-12-30", "value": 94.9},
        {"date": "2023-01-02", "value": 95.0},
        {"date": "2023-06-30", "value": 105.0},
        {"date": "2023-12-29", "value": 110.0},
        {"date": "2024-01-02", "value": 111.0},
        {"date": "2024-12-31", "value": 119.2},
    ]
)

_BUY_HOLD_CURVE_WITH_YEARS = json.dumps(
    [
        {"date": "2022-01-03", "value": 180.0},
        {"date": "2022-06-30", "value": 175.0},
        {"date": "2022-12-30", "value": 170.0},
        {"date": "2023-01-02", "value": 171.0},
        {"date": "2023-06-30", "value": 185.0},
        {"date": "2023-12-29", "value": 195.0},
        {"date": "2024-01-02", "value": 196.0},
        {"date": "2024-12-31", "value": 210.0},
    ]
)


@pytest.fixture()
def client_with_annual_returns_db(tmp_path: pathlib.Path) -> TestClient:
    """annual_returns と equity_curve/buy_hold_curve を含む run が入ったクライアント"""
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _create_backtest_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at,"
            " total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,"
            " profit_factor, total_trades,"
            " metrics_json, equity_curve_json, buy_hold_curve_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "run-annual01",
                "annual_strategy",
                "AAPL",
                "2026-01-01T00:00:00",
                10.0,
                1.1,
                -5.0,
                60.0,
                1.5,
                30,
                _ANNUAL_RETURNS_METRICS_JSON,
                _EQUITY_CURVE_WITH_YEARS,
                _BUY_HOLD_CURVE_WITH_YEARS,
            ),
        )
    forge_yaml = tmp_path / "forge.yaml"
    forge_yaml.write_text(
        "report:\n  db_filename: backtest_results.db\n"
        "  output_path: ./data/results\n"
    )
    return TestClient(create_app(forge_dir=tmp_path))


class TestAnnualReturns:
    def test_get_result_includes_annual_returns_with_int_keys(
        self, client_with_annual_returns_db: TestClient
    ) -> None:
        """annual_returns を含む metrics_json を持つ run が整数キーで annual_returns を返す"""
        response = client_with_annual_returns_db.get("/api/results/run-annual01")
        assert response.status_code == 200
        data = response.json()
        ar = data["metrics"]["annual_returns"]
        # JSON のキーは文字列になるが、値が正しくマッピングされていることを確認
        assert ar["2022"] == pytest.approx(-5.1)
        assert ar["2023"] == pytest.approx(15.5)
        assert ar["2024"] == pytest.approx(8.2)

    def test_get_result_annual_returns_empty_when_missing(
        self, client_with_db: TestClient
    ) -> None:
        """annual_returns がない旧 run では metrics.annual_returns が空 dict を返す"""
        response = client_with_db.get("/api/results/run-abc123")
        assert response.status_code == 200
        data = response.json()
        assert data["metrics"]["annual_returns"] == {}

    def test_get_result_includes_benchmark_annual_returns(
        self, client_with_annual_returns_db: TestClient
    ) -> None:
        """buy_hold_curve がある場合 benchmark_annual_returns が計算されて返される"""
        response = client_with_annual_returns_db.get("/api/results/run-annual01")
        assert response.status_code == 200
        data = response.json()
        bar = data["benchmark_annual_returns"]
        assert isinstance(bar, dict)
        assert len(bar) > 0
        for v in bar.values():
            assert isinstance(v, float)
        # 2022年: (170.0 - 180.0) / 180.0 * 100 ≈ -5.5556%
        assert bar["2022"] == pytest.approx((170.0 - 180.0) / 180.0 * 100.0, rel=1e-4)
        # 2023年: (195.0 - 170.0) / 170.0 * 100 ≈ 14.7059%
        assert bar["2023"] == pytest.approx((195.0 - 170.0) / 170.0 * 100.0, rel=1e-4)
        # 2024年: (210.0 - 195.0) / 195.0 * 100 ≈ 7.6923%
        assert bar["2024"] == pytest.approx((210.0 - 195.0) / 195.0 * 100.0, rel=1e-4)

    def test_get_result_benchmark_annual_returns_empty_without_buy_hold(
        self, client_with_db: TestClient
    ) -> None:
        """buy_hold_curve がない場合 benchmark_annual_returns が空 dict を返す"""
        response = client_with_db.get("/api/results/run-abc123")
        assert response.status_code == 200
        data = response.json()
        assert data["benchmark_annual_returns"] == {}


# ── regime_series / regime_breakdown ───────────────────────────────────────────

_REGIME_DATES = [
    "2022-01-03",
    "2022-01-04",
    "2022-01-05",
    "2022-01-06",
]

_REGIME_EQUITY_CURVE_JSON = json.dumps(
    [
        {"date": _REGIME_DATES[0], "value": 100.0},
        {"date": _REGIME_DATES[1], "value": 99.5},
        {"date": _REGIME_DATES[2], "value": 101.0},
        {"date": _REGIME_DATES[3], "value": 102.5},
    ]
)

_REGIME_METRICS_JSON = json.dumps(
    {
        "total_return_pct": 2.5,
        "sharpe_ratio": 1.1,
        "regime_series": {
            "dates": _REGIME_DATES,
            "states": [0, 0, 1, 1],
            "n_states": 2,
            "label_names": {"0": "Bear", "1": "Bull"},
        },
        "regime_breakdown": {
            "method": "HMM",
            "description": "GaussianHMM(n_components=2)",
            "periods": [
                {
                    "label": "Bear",
                    "start": _REGIME_DATES[0],
                    "end": _REGIME_DATES[1],
                    "sharpe": -0.5,
                    "win_rate_pct": 40.0,
                    "total_trades": 2,
                    "max_drawdown_pct": -3.0,
                },
                {
                    "label": "Bull",
                    "start": _REGIME_DATES[2],
                    "end": _REGIME_DATES[3],
                    "sharpe": 1.5,
                    "win_rate_pct": 65.0,
                    "total_trades": 3,
                    "max_drawdown_pct": -1.0,
                },
            ],
            "aggregates": {
                "Bear": {
                    "sharpe_avg": -0.5,
                    "win_rate_avg": 40.0,
                    "trades_total": 2,
                    "max_drawdown_avg": -3.0,
                },
                "Bull": {
                    "sharpe_avg": 1.5,
                    "win_rate_avg": 65.0,
                    "trades_total": 3,
                    "max_drawdown_avg": -1.0,
                },
            },
        },
    }
)


def _insert_regime_run(
    db_path: pathlib.Path,
    *,
    run_id: str = "run-regime01",
    metrics_json: str = _REGIME_METRICS_JSON,
    equity_curve_json: str = _REGIME_EQUITY_CURVE_JSON,
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at,"
            " total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,"
            " profit_factor, total_trades,"
            " metrics_json, equity_curve_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                "regime_strategy",
                "AAPL",
                "2026-01-01T00:00:00",
                2.5,
                1.1,
                -3.0,
                55.0,
                1.4,
                5,
                metrics_json,
                equity_curve_json,
            ),
        )


@pytest.fixture()
def client_with_regime_db(tmp_path: pathlib.Path) -> TestClient:
    """regime_series / regime_breakdown を含む metrics_json の run を持つクライアント"""
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _create_backtest_db(db_path)
    _insert_regime_run(db_path)
    forge_yaml = tmp_path / "forge.yaml"
    forge_yaml.write_text(
        "report:\n  db_filename: backtest_results.db\n"
        "  output_path: ./data/results\n"
    )
    return TestClient(create_app(forge_dir=tmp_path))


class TestRegimeSeries:
    def test_get_result_includes_regime_series(
        self, client_with_regime_db: TestClient
    ) -> None:
        """regime_series が API レスポンスに含まれ、states が int 配列で返る"""
        response = client_with_regime_db.get("/api/results/run-regime01")
        assert response.status_code == 200
        data = response.json()
        rs = data["regime_series"]
        assert rs["dates"] == _REGIME_DATES
        assert rs["states"] == [0, 0, 1, 1]
        assert all(isinstance(s, int) for s in rs["states"])
        assert rs["n_states"] == 2
        assert rs["label_names"] == {"0": "Bear", "1": "Bull"}

    def test_get_result_includes_regime_breakdown(
        self, client_with_regime_db: TestClient
    ) -> None:
        """regime_breakdown の aggregates がラベル別に正しく返る"""
        response = client_with_regime_db.get("/api/results/run-regime01")
        assert response.status_code == 200
        data = response.json()
        rb = data["regime_breakdown"]
        assert rb["method"] == "HMM"
        assert rb["description"] == "GaussianHMM(n_components=2)"
        assert isinstance(rb["periods"], list) and len(rb["periods"]) == 2
        agg = rb["aggregates"]
        assert agg["Bull"]["sharpe_avg"] == pytest.approx(1.5)
        assert agg["Bull"]["trades_total"] == 3
        assert agg["Bear"]["max_drawdown_avg"] == pytest.approx(-3.0)

    def test_get_result_omits_regime_when_missing(
        self, client_with_db: TestClient
    ) -> None:
        """regime 系フィールドが無い既存 run ではレスポンスにキーが存在しない"""
        response = client_with_db.get("/api/results/run-abc123")
        assert response.status_code == 200
        data = response.json()
        assert "regime_series" not in data
        assert "regime_breakdown" not in data

    def test_regime_series_dropped_when_states_length_mismatch(
        self,
        tmp_path: pathlib.Path,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """dates と states の長さ不一致 → regime_series が省略され warning が出る"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _create_backtest_db(db_path)
        bad_metrics = json.dumps(
            {
                "regime_series": {
                    "dates": _REGIME_DATES,
                    "states": [0, 1],  # 長さ 2、dates は 4
                    "n_states": 2,
                },
            }
        )
        _insert_regime_run(db_path, metrics_json=bad_metrics)
        (tmp_path / "forge.yaml").write_text(
            "report:\n  db_filename: backtest_results.db\n"
            "  output_path: ./data/results\n"
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        with caplog.at_level("WARNING"):
            response = client.get("/api/results/run-regime01")
        assert response.status_code == 200
        data = response.json()
        assert "regime_series" not in data
        assert any("regime_series" in rec.message for rec in caplog.records)

    def test_regime_series_dropped_when_equity_length_mismatch(
        self, tmp_path: pathlib.Path
    ) -> None:
        """regime_series の長さが equity_curve の dates と一致しない → 省略"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _create_backtest_db(db_path)
        # equity は 2 点、regime は 4 点
        equity_short = json.dumps(
            [
                {"date": _REGIME_DATES[0], "value": 100.0},
                {"date": _REGIME_DATES[1], "value": 99.0},
            ]
        )
        _insert_regime_run(db_path, equity_curve_json=equity_short)
        (tmp_path / "forge.yaml").write_text(
            "report:\n  db_filename: backtest_results.db\n"
            "  output_path: ./data/results\n"
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/results/run-regime01")
        assert response.status_code == 200
        data = response.json()
        assert "regime_series" not in data

    def test_regime_series_dropped_when_states_not_numeric(
        self, tmp_path: pathlib.Path
    ) -> None:
        """states に非数値が混入 → regime_series が省略される"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _create_backtest_db(db_path)
        bad_metrics = json.dumps(
            {
                "regime_series": {
                    "dates": _REGIME_DATES,
                    "states": [0, "x", 1, 1],
                    "n_states": 2,
                },
            }
        )
        _insert_regime_run(db_path, metrics_json=bad_metrics)
        (tmp_path / "forge.yaml").write_text(
            "report:\n  db_filename: backtest_results.db\n"
            "  output_path: ./data/results\n"
        )
        client = TestClient(create_app(forge_dir=tmp_path))
        response = client.get("/api/results/run-regime01")
        assert response.status_code == 200
        data = response.json()
        assert "regime_series" not in data

    def test_metrics_does_not_contain_regime_keys_after_shape(
        self, client_with_regime_db: TestClient
    ) -> None:
        """整形後の metrics dict から regime_series / regime_breakdown が pop されている"""
        response = client_with_regime_db.get("/api/results/run-regime01")
        assert response.status_code == 200
        data = response.json()
        assert "regime_series" not in data["metrics"]
        assert "regime_breakdown" not in data["metrics"]


# ---------------------------------------------------------------------------
# OptimizeRouter テスト
# ---------------------------------------------------------------------------


def _create_optimize_db(
    db_path: pathlib.Path,
    strategy_id: str,
    trials_json: list[dict] | None,
    best_metric_name: str = "sharpe_ratio",
    best_metric_value: float = 1.5,
) -> None:
    """optimization_runs テーブルを持つ最小 DB を作成してトライアルデータを挿入する。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS backtest_results (
                id INTEGER PRIMARY KEY,
                run_id TEXT NOT NULL UNIQUE,
                strategy_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                run_at TEXT NOT NULL,
                metrics_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS optimization_runs (
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
            """INSERT INTO optimization_runs
               (run_id, strategy_id, symbol, run_at, n_trials,
                best_metric_name, best_metric_value, best_params_json, all_trials_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "opt_grid_001",
                strategy_id,
                "AAPL",
                "2026-01-01T00:00:00",
                len(trials_json) if trials_json else 0,
                best_metric_name,
                best_metric_value,
                "{}",
                json.dumps(trials_json) if trials_json is not None else None,
            ),
        )
        conn.commit()
    finally:
        conn.close()


_GRID_TRIALS_3 = [
    {
        "sma_fast": 10.0,
        "sma_slow": 30.0,
        "sharpe_ratio": 1.25,
        "max_drawdown_pct": -12.0,
        "total_return_pct": 18.5,
        "total_trades": 42,
    },
    {
        "sma_fast": 14.0,
        "sma_slow": 40.0,
        "sharpe_ratio": -0.3,
        "max_drawdown_pct": -25.0,
        "total_return_pct": -5.0,
        "total_trades": 30,
    },
    {
        "sma_fast": 20.0,
        "sma_slow": 60.0,
        "sharpe_ratio": 0.85,
        "max_drawdown_pct": -8.0,
        "total_return_pct": 12.0,
        "total_trades": 25,
    },
]


class TestOptimizeRouter:
    def _setup_optimize_db(
        self,
        tmp_path: pathlib.Path,
        trials_json: list[dict] | None = None,
        strategy_id: str = "grid_strategy",
        best_metric_value: float = 1.5,
    ) -> tuple[TestClient, pathlib.Path]:
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        _create_optimize_db(
            db_path,
            strategy_id=strategy_id,
            trials_json=trials_json if trials_json is not None else _GRID_TRIALS_3,
            best_metric_value=best_metric_value,
        )
        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
                report:
                  output_path: ./data/results
                  db_filename: backtest_results.db
                """
            ).strip()
        )
        app = create_app(forge_dir=tmp_path)
        return TestClient(app), db_path

    def test_optimize_no_db(self, client: TestClient) -> None:
        """forge.db が存在しない場合は 404 を返す"""
        response = client.get("/api/optimize/some_strategy")
        assert response.status_code == 404

    def test_optimize_not_found(self, tmp_path: pathlib.Path) -> None:
        """optimization_runs に該当 strategy_id がない場合は 404 を返す"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        _create_optimize_db(db_path, strategy_id="other_strategy", trials_json=_GRID_TRIALS_3)
        (tmp_path / "forge.yaml").write_text(
            "report:\n  output_path: ./data/results\n  db_filename: backtest_results.db\n"
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/optimize/nonexistent_strategy")
        assert response.status_code == 404

    def test_optimize_ok(self, tmp_path: pathlib.Path) -> None:
        """Grid Search 形式のトライアルを正しく返す"""
        client, _ = self._setup_optimize_db(tmp_path)
        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 200
        data = response.json()
        assert data["strategy_id"] == "grid_strategy"
        assert data["metric_name"] == "sharpe_ratio"
        assert data["best_metric"] == pytest.approx(1.5)

        trials = data["trials"]
        assert len(trials) == 3

        t0 = trials[0]
        assert t0["params"] == {"sma_fast": 10.0, "sma_slow": 30.0}
        assert t0["metric"] == pytest.approx(1.25)
        assert t0["pass"] is True
        assert t0["metrics"]["max_drawdown_pct"] == pytest.approx(-12.0)

        # sharpe < 0 のトライアルは pass = False
        t1 = trials[1]
        assert t1["pass"] is False

    def test_optimize_no_trials_json(self, tmp_path: pathlib.Path) -> None:
        """all_trials_json が NULL の場合は trials が空配列で 200 を返す"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        _create_optimize_db(db_path, strategy_id="grid_strategy", trials_json=None)
        (tmp_path / "forge.yaml").write_text(
            "report:\n  output_path: ./data/results\n  db_filename: backtest_results.db\n"
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 200
        data = response.json()
        assert data["trials"] == []

    def test_optimize_param_dimensions_1(self, tmp_path: pathlib.Path) -> None:
        """パラメータ 1 次元でも壊れない"""
        trials_1d = [
            {"period": float(p), "sharpe_ratio": 0.5 + p * 0.01, "total_trades": 30}
            for p in range(5, 25)
        ]
        client, _ = self._setup_optimize_db(tmp_path, trials_json=trials_1d)
        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 200
        data = response.json()
        assert len(data["trials"]) == 20
        assert list(data["trials"][0]["params"].keys()) == ["period"]

    def test_optimize_param_dimensions_3plus(self, tmp_path: pathlib.Path) -> None:
        """パラメータ 3+ 次元でも壊れない"""
        trials_3d = [
            {
                "fast": float(f),
                "slow": float(s),
                "stop": 2.0,
                "sharpe_ratio": 1.0,
                "total_trades": 10,
            }
            for f in [10, 20]
            for s in [30, 50]
        ]
        client, _ = self._setup_optimize_db(tmp_path, trials_json=trials_3d)
        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 200
        data = response.json()
        assert len(data["trials"]) == 4
        first_params = data["trials"][0]["params"]
        assert set(first_params.keys()) == {"fast", "slow", "stop"}

    def test_optimize_skips_wfo_trials(self, tmp_path: pathlib.Path) -> None:
        """WFO 形式のトライアル（window_id / is_sharpe を含む）はスキップされる"""
        mixed_trials = [
            {
                "window_id": 1,
                "is_sharpe": 1.2,
                "oos_sharpe": 0.9,
                "is_start": "2021-01-04",
                "oos_start": "2021-07-01",
            },
            {
                "sma_fast": 10.0,
                "sma_slow": 30.0,
                "sharpe_ratio": 1.1,
                "total_trades": 20,
            },
        ]
        client, _ = self._setup_optimize_db(tmp_path, trials_json=mixed_trials)
        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 200
        data = response.json()
        assert len(data["trials"]) == 1
        assert "sma_fast" in data["trials"][0]["params"]
