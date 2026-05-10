"""wfo ルーターのテスト（Walk-Forward Optimization 結果集計 API）。"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import textwrap

from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import (
    build_backtest_db,
    seed_oos_equity_curves,
    seed_wfo_windows,
)


class TestWfoRouter:
    def test_wfo_no_db(self, client: TestClient) -> None:
        """backtest_results.db が存在しない場合は 404 を返す"""
        response = client.get("/api/wfo/some_strategy")
        assert response.status_code == 404

    def _setup_wfo_db(self, tmp_path: pathlib.Path, with_equity: bool = True) -> None:
        """WFO テスト用 DB と forge.yaml を作成する。"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        build_backtest_db(db_path)
        seed_wfo_windows(db_path)
        if with_equity:
            seed_oos_equity_curves(db_path)
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
        build_backtest_db(db_path)
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
