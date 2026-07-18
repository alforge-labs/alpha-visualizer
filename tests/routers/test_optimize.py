"""optimize ルーターのテスト（Grid Search トライアル取得）。"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import textwrap

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import build_optimize_db

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
        build_optimize_db(
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
        """backtest_results.db が存在しない場合は 404 を返す"""
        response = client.get("/api/optimize/some_strategy")
        assert response.status_code == 404

    def test_optimize_not_found(self, tmp_path: pathlib.Path) -> None:
        """optimization_runs に該当 strategy_id がない場合は 404 を返す"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        build_optimize_db(db_path, strategy_id="other_strategy", trials_json=_GRID_TRIALS_3)
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
        build_optimize_db(db_path, strategy_id="grid_strategy", trials_json=None)
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

    def test_optimize_returns_500_when_table_missing(
        self, tmp_path: pathlib.Path
    ) -> None:
        """backtest_results.db は存在するが optimization_runs テーブルが欠落している場合は
        DB 障害として 500 を返す（404 ではない）。"""
        db_path = tmp_path / "data" / "results" / "backtest_results.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # 空の DB ファイルを作成（テーブル無し）→ OperationalError を発生させる
        sqlite3.connect(db_path).close()
        (tmp_path / "forge.yaml").write_text(
            "report:\n  output_path: ./data/results\n  db_filename: backtest_results.db\n"
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/optimize/some_strategy")
        assert response.status_code == 500

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

    def test_optimize_skips_pure_wft_row_and_uses_previous_run(
        self, tmp_path: pathlib.Path
    ) -> None:
        """純 WFT 行（forge#1293 の walk-forward --save）が最新でも Optimize タブは
        直前の通常最適化ランを表示する。

        WHY: WFT 行を最新ランとして採用すると、trial 散布図が空になり
        best_metric が集約 OOS 値にすり替わる（PR forge#1294 レビュー MEDIUM）。
        """
        client, db_path = self._setup_optimize_db(tmp_path)
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                """INSERT INTO optimization_runs
                   (run_id, strategy_id, symbol, run_at, n_trials,
                    best_metric_name, best_metric_value, best_params_json,
                    all_trials_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "opt_wft_001",
                    "grid_strategy",
                    "AAPL",
                    "2026-02-01T00:00:00",
                    50,
                    "oos_sharpe_ratio",
                    1.1,
                    "{}",
                    json.dumps(
                        [
                            {
                                "window_id": 1,
                                "is_sharpe": 1.5,
                                "oos_sharpe": 1.0,
                                "oos_start": "2021-07-01",
                            }
                        ]
                    ),
                ),
            )
            conn.commit()
        finally:
            conn.close()

        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 200
        data = response.json()
        # WFT 行（best_metric=1.1・trials 空）ではなく通常ラン（1.5・3 trials）
        assert data["metric_name"] == "sharpe_ratio"
        assert data["best_metric"] == 1.5
        assert len(data["trials"]) == 3

    def test_optimize_only_wft_rows_is_404(self, tmp_path: pathlib.Path) -> None:
        """純 WFT 行しかない戦略は Optimize タブでは no_data（404）になる。"""
        wft_only = [
            {
                "window_id": 1,
                "is_sharpe": 1.2,
                "oos_sharpe": 0.9,
                "oos_start": "2021-07-01",
            }
        ]
        client, _ = self._setup_optimize_db(tmp_path, trials_json=wft_only)

        response = client.get("/api/optimize/grid_strategy")

        assert response.status_code == 404
