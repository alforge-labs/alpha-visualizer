"""/api/historical/{symbol} ルーターの統合テスト。"""

from __future__ import annotations

import pathlib

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app


def _write_sample_parquet(dir_: pathlib.Path, symbol: str, interval: str) -> None:
    dir_.mkdir(parents=True, exist_ok=True)
    idx = pd.date_range("2025-01-02", periods=5, freq="B")
    df = pd.DataFrame(
        {
            "Open": [100.0 + i for i in range(5)],
            "High": [101.0 + i for i in range(5)],
            "Low": [99.0 + i for i in range(5)],
            "Close": [100.5 + i for i in range(5)],
            "Volume": [1_000_000.0 + i * 1000 for i in range(5)],
        },
        index=idx,
    )
    df.to_parquet(dir_ / f"{symbol}_{interval}.parquet")


@pytest.fixture()
def client_with_historical(tmp_path: pathlib.Path) -> TestClient:
    """historical_dir に SPY_1d.parquet が入った状態のクライアント。"""
    hist_dir = tmp_path / "data" / "historical"
    _write_sample_parquet(hist_dir, "SPY", "1d")
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


class TestHistoricalEndpoint:
    def test_returns_bars_for_existing_symbol(
        self, client_with_historical: TestClient
    ) -> None:
        """対象 parquet が存在すれば 200 + bars 配列を返す"""
        resp = client_with_historical.get("/api/historical/SPY?interval=1d")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["symbol"] == "SPY"
        assert payload["interval"] == "1d"
        assert len(payload["bars"]) == 5
        first = payload["bars"][0]
        assert first["time"] == "2025-01-02"
        assert first["open"] == 100.0
        assert first["close"] == 100.5
        assert first["volume"] == 1_000_000.0

    def test_default_interval_is_1d(
        self, client_with_historical: TestClient
    ) -> None:
        """interval 省略時は 1d がデフォルト"""
        resp = client_with_historical.get("/api/historical/SPY")
        assert resp.status_code == 200
        assert resp.json()["interval"] == "1d"

    def test_404_when_parquet_missing(self, client: TestClient) -> None:
        """historical_dir が存在しない / parquet が無い場合は 404"""
        # client fixture は何も無い空 forge_dir
        resp = client.get("/api/historical/SPY?interval=1d")
        assert resp.status_code == 404
        assert "detail" in resp.json()

    def test_404_when_unknown_symbol(
        self, client_with_historical: TestClient
    ) -> None:
        """ディレクトリはあるが対象 symbol の parquet が無ければ 404"""
        resp = client_with_historical.get("/api/historical/UNKNOWN?interval=1d")
        assert resp.status_code == 404

    def test_400_invalid_interval(
        self, client_with_historical: TestClient
    ) -> None:
        """interval が whitelist 外なら 422（FastAPI が pattern で reject）"""
        resp = client_with_historical.get("/api/historical/SPY?interval=invalid")
        # FastAPI pattern validation は 422 を返す
        assert resp.status_code == 422

    def test_start_end_filter(self, client_with_historical: TestClient) -> None:
        """start / end クエリパラメータで slice される"""
        resp = client_with_historical.get(
            "/api/historical/SPY?interval=1d&start=2025-01-06&end=2025-01-07"
        )
        assert resp.status_code == 200
        bars = resp.json()["bars"]
        assert len(bars) == 2
        assert bars[0]["time"] == "2025-01-06"
        assert bars[-1]["time"] == "2025-01-07"

    def test_400_invalid_date(self, client_with_historical: TestClient) -> None:
        """start に parse 不可能な文字列を渡すと 400"""
        resp = client_with_historical.get(
            "/api/historical/SPY?interval=1d&start=not-a-date"
        )
        assert resp.status_code == 400
