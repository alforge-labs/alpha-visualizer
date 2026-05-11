"""合成 OHLCV 生成器の単体テスト。

- 5 銘柄分が決定論的に生成される
- OHLC の整合性が保たれる（H ≥ max(O,C), L ≤ min(O,C), H ≥ L）
- 各銘柄の MDD が「魅力的な」想定レンジに収まっている
- 期間長・index 型・カラム名が API 期待通り
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from samples._generators.synthetic_ohlcv import (
    N_BUSINESS_DAYS,
    SYMBOL_BASE_PRICES,
    SYMBOL_REGIMES,
    build_all,
    generate_ohlcv,
    max_drawdown_pct,
)

EXPECTED_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]

# 各銘柄の MDD 許容レンジ（負値、深い順）。
# 上限は「これより浅いと魅力に欠ける」、下限は「これより深いと現実味が崩れる」のガード。
MDD_RANGE_PCT: dict[str, tuple[float, float]] = {
    "EQUITY_SYNTH": (-55.0, -25.0),
    "INDEX_SYNTH": (-50.0, -25.0),
    "COMMODITY_SYNTH": (-55.0, -25.0),
    "FX_SYNTH": (-25.0, -5.0),
    "CRYPTO_SYNTH": (-95.0, -55.0),
}


@pytest.fixture(scope="module")
def all_data() -> dict[str, pd.DataFrame]:
    return build_all()


def test_build_all_returns_all_symbols(all_data: dict[str, pd.DataFrame]) -> None:
    assert set(all_data.keys()) == set(SYMBOL_REGIMES.keys())
    assert len(all_data) == 5


@pytest.mark.parametrize("symbol", list(SYMBOL_REGIMES.keys()))
def test_each_symbol_has_expected_length_and_columns(
    all_data: dict[str, pd.DataFrame], symbol: str
) -> None:
    df = all_data[symbol]
    assert len(df) == N_BUSINESS_DAYS, f"{symbol}: length mismatch"
    assert list(df.columns) == EXPECTED_COLUMNS
    assert isinstance(df.index, pd.DatetimeIndex)
    assert df.index.is_monotonic_increasing


@pytest.mark.parametrize("symbol", list(SYMBOL_REGIMES.keys()))
def test_ohlc_consistency(all_data: dict[str, pd.DataFrame], symbol: str) -> None:
    df = all_data[symbol]
    high = df["High"].to_numpy()
    low = df["Low"].to_numpy()
    open_ = df["Open"].to_numpy()
    close = df["Close"].to_numpy()
    assert np.all(high >= low), f"{symbol}: H < L found"
    assert np.all(high >= open_), f"{symbol}: H < Open found"
    assert np.all(high >= close), f"{symbol}: H < Close found"
    assert np.all(low <= open_), f"{symbol}: L > Open found"
    assert np.all(low <= close), f"{symbol}: L > Close found"
    assert np.all(df["Volume"].to_numpy() >= 0), f"{symbol}: negative volume"
    assert np.all(close > 0), f"{symbol}: non-positive close"


@pytest.mark.parametrize("symbol", list(SYMBOL_REGIMES.keys()))
def test_initial_close_near_base_price(
    all_data: dict[str, pd.DataFrame], symbol: str
) -> None:
    """初日の Close がベース価格から ±3% 程度に収まることを確認する。"""
    df = all_data[symbol]
    base = SYMBOL_BASE_PRICES[symbol]
    ratio = df["Close"].iloc[0] / base
    assert 0.95 <= ratio <= 1.05, (
        f"{symbol}: initial close {df['Close'].iloc[0]:.4f} too far from base {base}"
    )


@pytest.mark.parametrize("symbol", list(MDD_RANGE_PCT.keys()))
def test_mdd_within_expected_range(
    all_data: dict[str, pd.DataFrame], symbol: str
) -> None:
    df = all_data[symbol]
    mdd = max_drawdown_pct(df["Close"])
    lo, hi = MDD_RANGE_PCT[symbol]
    assert lo <= mdd <= hi, f"{symbol}: MDD {mdd:.2f}% out of [{lo}, {hi}]"


@pytest.mark.parametrize("symbol", list(SYMBOL_REGIMES.keys()))
def test_determinism(symbol: str) -> None:
    df1 = generate_ohlcv(symbol)
    df2 = generate_ohlcv(symbol)
    pd.testing.assert_frame_equal(df1, df2)


def test_total_return_positive_for_all_symbols(
    all_data: dict[str, pd.DataFrame],
) -> None:
    """全銘柄の最終リターンがプラスで終わる（デモ的に「魅力」を担保する）。"""
    for symbol, df in all_data.items():
        total = df["Close"].iloc[-1] / df["Close"].iloc[0] - 1.0
        assert total > 0.0, f"{symbol}: total return {total * 100:.1f}% is non-positive"


def test_unknown_symbol_raises_key_error() -> None:
    with pytest.raises(KeyError):
        generate_ohlcv("UNKNOWN_SYNTH")


def test_max_drawdown_pct_on_monotonic_increasing_returns_zero() -> None:
    series = pd.Series([100.0, 101.0, 102.0, 103.0])
    assert max_drawdown_pct(series) == 0.0


def test_max_drawdown_pct_on_known_series() -> None:
    series = pd.Series([100.0, 110.0, 88.0, 95.0])
    # ピーク 110 → 底 88 で -20%
    assert max_drawdown_pct(series) == pytest.approx(-20.0)
