"""results ルーターのテスト（一覧・詳細・benchmark / annual_returns / regime）。"""

from __future__ import annotations

import json
import pathlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from tests.factories import build_backtest_db, insert_regime_run


class TestResultsRouter:
    def test_list_results_empty_db(self, client: TestClient) -> None:
        """backtest_results.db が存在しない場合は空リストを返す"""
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
        """backtest_results.db が存在しない場合は 404 を返す"""
        response = client.get("/api/results/nonexistent_run")
        assert response.status_code == 404


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
    build_backtest_db(db_path)
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
    build_backtest_db(db_path)
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


@pytest.fixture()
def client_with_regime_db(tmp_path: pathlib.Path) -> TestClient:
    """regime_series / regime_breakdown を含む metrics_json の run を持つクライアント"""
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    build_backtest_db(db_path)
    insert_regime_run(
        db_path,
        run_id="run-regime01",
        metrics_json=_REGIME_METRICS_JSON,
        equity_curve_json=_REGIME_EQUITY_CURVE_JSON,
    )
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
        build_backtest_db(db_path)
        bad_metrics = json.dumps(
            {
                "regime_series": {
                    "dates": _REGIME_DATES,
                    "states": [0, 1],  # 長さ 2、dates は 4
                    "n_states": 2,
                },
            }
        )
        insert_regime_run(
            db_path,
            run_id="run-regime01",
            metrics_json=bad_metrics,
            equity_curve_json=_REGIME_EQUITY_CURVE_JSON,
        )
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
        build_backtest_db(db_path)
        # equity は 2 点、regime は 4 点
        equity_short = json.dumps(
            [
                {"date": _REGIME_DATES[0], "value": 100.0},
                {"date": _REGIME_DATES[1], "value": 99.0},
            ]
        )
        insert_regime_run(
            db_path,
            run_id="run-regime01",
            metrics_json=_REGIME_METRICS_JSON,
            equity_curve_json=equity_short,
        )
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
        build_backtest_db(db_path)
        bad_metrics = json.dumps(
            {
                "regime_series": {
                    "dates": _REGIME_DATES,
                    "states": [0, "x", 1, 1],
                    "n_states": 2,
                },
            }
        )
        insert_regime_run(
            db_path,
            run_id="run-regime01",
            metrics_json=bad_metrics,
            equity_curve_json=_REGIME_EQUITY_CURVE_JSON,
        )
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
