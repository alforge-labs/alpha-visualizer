"""GET /api/strategies/{id}/sparkline のテスト (issue #387)

Browse の行ホバー sparkline が「run 一覧 → 2MB 級フル詳細」の 2 連 fetch に
なっていた問題への軽量 API。最新 run の equity をダウンサンプルして返す。
"""
from __future__ import annotations

import json
import pathlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import build_backtest_db


def _insert_run(
    db_path: pathlib.Path,
    *,
    run_id: str,
    strategy_id: str,
    run_at: str,
    equity_json: str | None,
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at, total_return_pct, sharpe_ratio,"
            " max_drawdown_pct, win_rate_pct, profit_factor, total_trades,"
            " metrics_json, equity_curve_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, strategy_id, "AAPL", run_at, 10.0, 1.5, -5.0, 60.0, 1.8, 50, "{}", equity_json),
        )


@pytest.fixture()
def client_with_equity_runs(tmp_path: pathlib.Path) -> TestClient:
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    build_backtest_db(db_path)

    old_equity = json.dumps(
        [{"date": f"2025-01-{i + 1:02d}", "value": 999.0} for i in range(10)]
    )
    new_equity = json.dumps(
        [{"date": "2026-01-01", "value": 100.0 + i * 0.5} for i in range(500)]
    )
    short_equity = json.dumps(
        [{"date": "2026-01-01", "value": 100.0 + i} for i in range(10)]
    )
    _insert_run(db_path, run_id="run-old", strategy_id="eq_strategy",
                run_at="2025-06-01T00:00:00", equity_json=old_equity)
    _insert_run(db_path, run_id="run-new", strategy_id="eq_strategy",
                run_at="2026-01-01T00:00:00", equity_json=new_equity)
    _insert_run(db_path, run_id="run-short", strategy_id="short_strategy",
                run_at="2026-01-01T00:00:00", equity_json=short_equity)
    _insert_run(db_path, run_id="run-noeq", strategy_id="noeq_strategy",
                run_at="2026-01-01T00:00:00", equity_json=None)

    forge_yaml = tmp_path / "forge.yaml"
    forge_yaml.write_text(
        "report:\n  db_filename: backtest_results.db\n  output_path: ./data/results\n"
    )
    return TestClient(create_app(forge_dir=tmp_path))


def test_sparkline_returns_downsampled_latest_equity(
    client_with_equity_runs: TestClient,
) -> None:
    resp = client_with_equity_runs.get("/api/strategies/eq_strategy/sparkline")
    assert resp.status_code == 200
    body = resp.json()
    # run_at 降順で最新の run を選ぶ（古い run-old の 999.0 が混ざらない）
    assert body["run_id"] == "run-new"
    values = body["values"]
    # 500 点はダウンサンプルされ、始点・終点は保存される
    assert 2 <= len(values) <= 60
    assert values[0] == 100.0
    assert values[-1] == pytest.approx(100.0 + 499 * 0.5)
    assert 999.0 not in values
    # フル詳細（約 2MB）でなく軽量レスポンスであること
    assert len(resp.content) < 4096


def test_sparkline_short_series_is_returned_as_is(
    client_with_equity_runs: TestClient,
) -> None:
    resp = client_with_equity_runs.get("/api/strategies/short_strategy/sparkline")
    assert resp.status_code == 200
    assert resp.json()["values"] == [100.0 + i for i in range(10)]


def test_sparkline_404_when_strategy_has_no_runs(
    client_with_equity_runs: TestClient,
) -> None:
    resp = client_with_equity_runs.get("/api/strategies/unknown/sparkline")
    assert resp.status_code == 404


def test_sparkline_404_when_latest_run_has_no_equity(
    client_with_equity_runs: TestClient,
) -> None:
    """equity 未保存の run しか無い場合は「データなし」として 404。"""
    resp = client_with_equity_runs.get("/api/strategies/noeq_strategy/sparkline")
    assert resp.status_code == 404


def test_sparkline_404_when_db_missing(client: TestClient) -> None:
    resp = client.get("/api/strategies/any/sparkline")
    assert resp.status_code == 404
