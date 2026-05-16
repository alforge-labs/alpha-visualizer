"""services.historical の純関数テスト。"""

from __future__ import annotations

import pathlib

import numpy as np
import pandas as pd
import pytest

from alpha_visualizer.services import historical as historical_service


def _write_parquet(dir_: pathlib.Path, name: str, df: pd.DataFrame) -> pathlib.Path:
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / name
    df.to_parquet(path)
    return path


def _sample_df(n: int = 5) -> pd.DataFrame:
    idx = pd.date_range("2025-01-02", periods=n, freq="B")
    return pd.DataFrame(
        {
            "Open": [100.0 + i for i in range(n)],
            "High": [101.0 + i for i in range(n)],
            "Low": [99.0 + i for i in range(n)],
            "Close": [100.5 + i for i in range(n)],
            "Volume": [1_000_000.0 + i * 1000 for i in range(n)],
        },
        index=idx,
    )


class TestValidateSymbol:
    @pytest.mark.parametrize(
        "bad",
        ["", "  ", "../etc/passwd", "AA/BB", "AA\\BB", "AA..BB", "AA\x00BB"],
    )
    def test_unsafe_symbol_rejected(self, bad: str) -> None:
        with pytest.raises(ValueError):
            historical_service._validate_symbol(bad)

    @pytest.mark.parametrize(
        "ok",
        ["SPY", "AAPL", "BTC-USD", "CL=F", "GC=F", "EURUSD=X"],
    )
    def test_normal_symbol_accepted(self, ok: str) -> None:
        # 例外を投げなければ OK
        historical_service._validate_symbol(ok)


class TestLoadOhlc:
    def test_load_basic(self, tmp_path: pathlib.Path) -> None:
        """parquet を読んで 5 件の bar を返す"""
        _write_parquet(tmp_path, "SPY_1d.parquet", _sample_df(5))
        bars = historical_service.load_ohlc(tmp_path, "SPY", "1d")
        assert len(bars) == 5
        assert bars[0]["time"] == "2025-01-02"
        assert bars[0]["open"] == 100.0
        assert bars[0]["high"] == 101.0
        assert bars[0]["low"] == 99.0
        assert bars[0]["close"] == 100.5
        assert bars[0]["volume"] == 1_000_000.0

    def test_load_filters_by_start(self, tmp_path: pathlib.Path) -> None:
        """start パラメータで日付以前を除外する"""
        _write_parquet(tmp_path, "SPY_1d.parquet", _sample_df(5))
        bars = historical_service.load_ohlc(
            tmp_path, "SPY", "1d", start="2025-01-06"
        )
        # 1/2, 1/3, 1/6, 1/7, 1/8 のうち >=1/6 で 3 件
        assert len(bars) == 3
        assert bars[0]["time"] == "2025-01-06"

    def test_load_filters_by_end(self, tmp_path: pathlib.Path) -> None:
        """end パラメータで日付以降を除外する"""
        _write_parquet(tmp_path, "SPY_1d.parquet", _sample_df(5))
        bars = historical_service.load_ohlc(
            tmp_path, "SPY", "1d", end="2025-01-06"
        )
        # 1/2, 1/3, 1/6 までで 3 件
        assert len(bars) == 3
        assert bars[-1]["time"] == "2025-01-06"

    def test_load_filters_by_start_and_end(self, tmp_path: pathlib.Path) -> None:
        """start と end の組み合わせで slice する"""
        _write_parquet(tmp_path, "SPY_1d.parquet", _sample_df(5))
        bars = historical_service.load_ohlc(
            tmp_path, "SPY", "1d", start="2025-01-03", end="2025-01-07"
        )
        # 1/3, 1/6, 1/7 で 3 件
        assert len(bars) == 3
        assert bars[0]["time"] == "2025-01-03"
        assert bars[-1]["time"] == "2025-01-07"

    def test_load_missing_file_raises(self, tmp_path: pathlib.Path) -> None:
        """対象 parquet が無ければ FileNotFoundError"""
        tmp_path.mkdir(exist_ok=True)
        with pytest.raises(FileNotFoundError):
            historical_service.load_ohlc(tmp_path, "SPY", "1d")

    def test_load_unsafe_symbol_raises(self, tmp_path: pathlib.Path) -> None:
        """symbol に / を含めれば ValueError"""
        with pytest.raises(ValueError):
            historical_service.load_ohlc(tmp_path, "../etc/passwd", "1d")

    def test_load_invalid_date_format_raises(self, tmp_path: pathlib.Path) -> None:
        """start の文字列が parse できなければ ValueError"""
        _write_parquet(tmp_path, "SPY_1d.parquet", _sample_df(5))
        with pytest.raises(ValueError):
            historical_service.load_ohlc(
                tmp_path, "SPY", "1d", start="not-a-date"
            )

    def test_load_nan_volume_becomes_none(self, tmp_path: pathlib.Path) -> None:
        """NaN の volume は None として返す"""
        df = _sample_df(3)
        df.loc[df.index[1], "Volume"] = np.nan
        _write_parquet(tmp_path, "SPY_1d.parquet", df)
        bars = historical_service.load_ohlc(tmp_path, "SPY", "1d")
        assert bars[1]["volume"] is None

    def test_load_intraday_time_format(self, tmp_path: pathlib.Path) -> None:
        """時刻情報のある parquet は ISO 8601 datetime 形式で返す"""
        idx = pd.date_range("2025-01-02 09:30:00", periods=3, freq="1h")
        df = pd.DataFrame(
            {
                "Open": [100.0, 101.0, 102.0],
                "High": [101.0, 102.0, 103.0],
                "Low": [99.0, 100.0, 101.0],
                "Close": [100.5, 101.5, 102.5],
                "Volume": [1_000_000.0, 1_000_000.0, 1_000_000.0],
            },
            index=idx,
        )
        _write_parquet(tmp_path, "SPY_1h.parquet", df)
        bars = historical_service.load_ohlc(tmp_path, "SPY", "1h")
        assert bars[0]["time"] == "2025-01-02T09:30:00"
        assert bars[1]["time"] == "2025-01-02T10:30:00"

    def test_load_without_volume_column(self, tmp_path: pathlib.Path) -> None:
        """Volume カラムが無い parquet では volume=None"""
        idx = pd.date_range("2025-01-02", periods=3, freq="B")
        df = pd.DataFrame(
            {
                "Open": [100.0, 101.0, 102.0],
                "High": [101.0, 102.0, 103.0],
                "Low": [99.0, 100.0, 101.0],
                "Close": [100.5, 101.5, 102.5],
            },
            index=idx,
        )
        _write_parquet(tmp_path, "SPY_1d.parquet", df)
        bars = historical_service.load_ohlc(tmp_path, "SPY", "1d")
        assert bars[0]["volume"] is None
