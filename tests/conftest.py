"""共通テストフィクスチャ"""

from __future__ import annotations

import json
import pathlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import build_backtest_db


@pytest.fixture(autouse=True)
def _clear_forge_config_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """テスト中の FORGE_CONFIG 漏れを防ぐ。

    開発環境のシェルに ``FORGE_CONFIG=/path/to/alpha-strategies/forge.yaml`` が
    設定されていると、forge.yaml 探索順序のテストが意図しない挙動になる。
    全テストでデフォルト「環境変数なし」を保証し、必要なテストは個別に
    ``monkeypatch.setenv`` で明示する。
    """
    monkeypatch.delenv("FORGE_CONFIG", raising=False)


@pytest.fixture()
def client(tmp_path: pathlib.Path) -> TestClient:
    """forge_dir に何も無い空クライアント。"""
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


@pytest.fixture()
def client_with_strategies(tmp_path: pathlib.Path) -> TestClient:
    """戦略 JSON とアイデア JSON を持つクライアント。"""
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


@pytest.fixture()
def client_with_db(tmp_path: pathlib.Path) -> TestClient:
    """backtest_results.db に1件の run が入った状態のクライアント。

    複数のルーターテスト（results / run / benchmark / annual_returns / regime）で
    再利用するため conftest に置く。
    """
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    build_backtest_db(db_path)
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
