"""銘柄ごとのレジーム合成 OHLCV を生成するモジュール。

5 銘柄分の `_SYNTH` データをそれぞれストーリー性のあるレジーム列で組み立てる：

- ``EQUITY_SYNTH``  : calm-bull → 2008 風 crash → recovery → calm → 軽い調整
- ``INDEX_SYNTH``   : 長期 calm → 2020 風 V 字（急落＋V 回復） → 長期 calm-bull
- ``COMMODITY_SYNTH``: 長期 sideways → spike → blow-off → slow bleed
- ``FX_SYNTH``      : 全期間 mean-reverting（AR(1) 適用）
- ``CRYPTO_SYNTH``  : bubble1 → crash → consolidation → bubble2 → flash-crash → recovery

GBM + Poisson ジャンプを基本とし、必要に応じて AR(1) ノイズを上乗せする。
seed は銘柄ごとに固定し、何度呼んでもバイト等価な結果を返す（決定論的）。

`numpy` / `pandas` のみ使用。`alpha_forge` には依存しない。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

PERIOD_START: date = date(2020, 1, 2)
"""サンプル期間の開始日（営業日カレンダーで進む）。"""

N_BUSINESS_DAYS: int = 1250
"""1 銘柄あたりの営業日数（約 5 年）。"""


@dataclass(frozen=True)
class Regime:
    """1 つのレジームを表す不変データクラス。

    Attributes:
        days: このレジームが続く営業日数。
        drift: 日次対数収益の平均。
        vol: 日次対数収益の標準偏差。
        jump_intensity: Poisson ジャンプの 1 営業日あたり到着率。
        jump_mean: ジャンプサイズの平均（負値で下方ジャンプ）。
        jump_std: ジャンプサイズの標準偏差。
        label: 人間可読のレジーム名。デバッグ・ログ表示用。
    """

    days: int
    drift: float
    vol: float
    jump_intensity: float = 0.0
    jump_mean: float = 0.0
    jump_std: float = 0.0
    label: str = ""


# 各銘柄のレジーム列。合計営業日数が N_BUSINESS_DAYS と一致する必要がある。
SYMBOL_REGIMES: dict[str, list[Regime]] = {
    "EQUITY_SYNTH": [
        Regime(days=250, drift=0.0008, vol=0.012, label="calm-bull-pre"),
        Regime(
            days=80,
            drift=-0.0040,
            vol=0.030,
            jump_intensity=0.05,
            jump_mean=-0.040,
            jump_std=0.020,
            label="crash-2008-like",
        ),
        Regime(days=250, drift=0.0012, vol=0.018, label="recovery"),
        Regime(days=400, drift=0.0005, vol=0.010, label="calm-bull-mid"),
        Regime(days=80, drift=-0.0020, vol=0.022, label="late-correction"),
        Regime(days=190, drift=0.0008, vol=0.012, label="calm-bull-post"),
    ],
    "INDEX_SYNTH": [
        Regime(days=600, drift=0.0006, vol=0.008, label="calm-long"),
        Regime(
            days=30,
            drift=-0.0080,
            vol=0.040,
            jump_intensity=0.08,
            jump_mean=-0.040,
            jump_std=0.020,
            label="crash-2020-like",
        ),
        Regime(days=60, drift=0.0080, vol=0.025, label="v-recovery"),
        Regime(days=560, drift=0.0007, vol=0.009, label="calm-bull-post"),
    ],
    "COMMODITY_SYNTH": [
        Regime(days=500, drift=0.0001, vol=0.014, label="sideways"),
        Regime(days=200, drift=0.0030, vol=0.022, label="spike"),
        Regime(days=50, drift=-0.0040, vol=0.035, label="blow-off-top"),
        Regime(days=500, drift=-0.0003, vol=0.016, label="slow-bleed"),
    ],
    "FX_SYNTH": [
        Regime(days=1250, drift=0.00005, vol=0.005, label="mean-reverting"),
    ],
    "CRYPTO_SYNTH": [
        Regime(days=200, drift=0.0050, vol=0.045, label="bubble-1"),
        Regime(
            days=60,
            drift=-0.0120,
            vol=0.060,
            jump_intensity=0.05,
            jump_mean=-0.080,
            jump_std=0.040,
            label="crash-1",
        ),
        Regime(days=250, drift=0.0002, vol=0.035, label="consolidation"),
        Regime(days=250, drift=0.0040, vol=0.045, label="bubble-2"),
        Regime(
            days=30,
            drift=-0.0030,
            vol=0.080,
            jump_intensity=0.15,
            jump_mean=-0.100,
            jump_std=0.050,
            label="flash-crash",
        ),
        Regime(days=460, drift=0.0015, vol=0.040, label="recovery"),
    ],
}


SYMBOL_SEEDS: dict[str, int] = {
    "EQUITY_SYNTH": 11,
    "INDEX_SYNTH": 22,
    "COMMODITY_SYNTH": 33,
    "FX_SYNTH": 44,
    "CRYPTO_SYNTH": 55,
}


SYMBOL_BASE_PRICES: dict[str, float] = {
    "EQUITY_SYNTH": 100.0,
    "INDEX_SYNTH": 4500.0,
    "COMMODITY_SYNTH": 80.0,
    "FX_SYNTH": 1.10,
    "CRYPTO_SYNTH": 30_000.0,
}


SYMBOL_AR1_PHI: dict[str, float] = {
    "FX_SYNTH": -0.05,
}
"""AR(1) を適用する銘柄と係数 phi（指定がない銘柄は phi=0 で適用しない）。"""


SYMBOL_BASE_VOLUMES: dict[str, float] = {
    "EQUITY_SYNTH": 1_500_000.0,
    "INDEX_SYNTH": 80_000_000.0,
    "COMMODITY_SYNTH": 200_000.0,
    "FX_SYNTH": 50_000.0,
    "CRYPTO_SYNTH": 20_000.0,
}


def business_dates(start: date, n: int) -> list[date]:
    """``start`` 以降の営業日（月-金）を ``n`` 個返す。

    Args:
        start: 探索開始日。営業日でなくても良い。
        n: 必要な営業日数。

    Returns:
        営業日リスト（昇順、長さ ``n``）。
    """
    out: list[date] = []
    current = start
    while len(out) < n:
        if current.weekday() < 5:
            out.append(current)
        current += timedelta(days=1)
    return out


def _simulate_log_returns(
    regimes: list[Regime],
    rng: np.random.Generator,
    phi: float = 0.0,
) -> np.ndarray:
    """レジーム列に従って日次対数収益列を生成する。

    Args:
        regimes: 適用するレジームの順序付きリスト。
        rng: ``numpy`` 乱数ジェネレータ（seed は呼び出し側で固定済み想定）。
        phi: AR(1) 係数。0 のときは AR(1) を適用しない。

    Returns:
        ``shape=(sum(r.days),)`` の対数収益列。
    """
    parts: list[np.ndarray] = []
    ar_state = 0.0
    for regime in regimes:
        n = regime.days
        if n <= 0:
            continue
        normal_shock = rng.standard_normal(n)
        ret = regime.drift + regime.vol * normal_shock
        if regime.jump_intensity > 0.0:
            jump_count = rng.poisson(regime.jump_intensity, size=n)
            jump_size = rng.normal(regime.jump_mean, regime.jump_std, size=n)
            ret = ret + jump_count * jump_size
        if phi != 0.0:
            ar = np.empty(n)
            for i in range(n):
                ar[i] = phi * ar_state + ret[i]
                ar_state = ar[i]
            ret = ar
        parts.append(ret)
    if not parts:
        return np.zeros(0)
    return np.concatenate(parts)


def _build_ohlcv(
    log_returns: np.ndarray,
    base_price: float,
    rng: np.random.Generator,
    dates: list[date],
    base_volume: float,
) -> pd.DataFrame:
    """``Close`` 系列から OHLCV DataFrame を組み立てる。

    Open は前日 Close から小さなギャップで開く前提。High/Low は当日のレンジ幅
    （ボラに連動）から拡張する。最後に ``H = max(O,H,L,C)``、``L = min(O,H,L,C)``
    で再クランプして整合性を保証する。
    """
    n = len(log_returns)
    close = base_price * np.exp(np.cumsum(log_returns))
    # 直近 vol ベースのレンジ幅プロキシ
    daily_vol_proxy = np.abs(rng.standard_normal(n)) * 0.012
    daily_range = daily_vol_proxy * close
    # Open: 前日 Close + 小さなギャップ（vol/3 のガウス）
    gap = rng.normal(0.0, 0.004, size=n)
    open_prices = np.empty(n)
    open_prices[0] = base_price * (1.0 + gap[0])
    open_prices[1:] = close[:-1] * (1.0 + gap[1:])
    # High / Low: max/min(O, C) からそれぞれ拡張
    upper_extension = rng.uniform(0.0, 0.6, size=n) * daily_range
    lower_extension = rng.uniform(0.0, 0.4, size=n) * daily_range
    high_raw = np.maximum(open_prices, close) + upper_extension
    low_raw = np.minimum(open_prices, close) - lower_extension
    # 整合性最終クランプ
    stacked = np.column_stack([open_prices, high_raw, low_raw, close])
    high = np.max(stacked, axis=1)
    low = np.min(stacked, axis=1)
    # Volume: ボラに比例（前日比リターンの絶対値で増幅）
    pct_change = np.abs(np.diff(close, prepend=close[0])) / close
    expected_volume = base_volume * (1.0 + 5.0 * pct_change)
    volume = rng.poisson(np.clip(expected_volume, 1.0, None)).astype(float)
    index = pd.DatetimeIndex([pd.Timestamp(d) for d in dates], name="Date")
    return pd.DataFrame(
        {
            "Open": open_prices,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
        },
        index=index,
    )


def generate_ohlcv(
    symbol: str,
    *,
    start: date = PERIOD_START,
) -> pd.DataFrame:
    """指定銘柄の合成 OHLCV を返す。

    Args:
        symbol: ``SYMBOL_REGIMES`` のキー（``EQUITY_SYNTH`` など）。
        start: 期間開始日。デフォルトは ``PERIOD_START``。

    Returns:
        ``DatetimeIndex`` 付きの ``Open / High / Low / Close / Volume`` DataFrame。

    Raises:
        KeyError: 未定義のシンボルが渡された場合。
        ValueError: レジーム列の合計日数が ``N_BUSINESS_DAYS`` と一致しない場合。
    """
    if symbol not in SYMBOL_REGIMES:
        raise KeyError(f"unknown synthetic symbol: {symbol!r}")
    regimes = SYMBOL_REGIMES[symbol]
    total_days = sum(r.days for r in regimes)
    if total_days != N_BUSINESS_DAYS:
        raise ValueError(
            f"regime days for {symbol!r} sum to {total_days}, expected {N_BUSINESS_DAYS}"
        )
    seed = SYMBOL_SEEDS[symbol]
    base_price = SYMBOL_BASE_PRICES[symbol]
    base_volume = SYMBOL_BASE_VOLUMES[symbol]
    phi = SYMBOL_AR1_PHI.get(symbol, 0.0)
    rng = np.random.default_rng(seed)
    log_returns = _simulate_log_returns(regimes, rng, phi=phi)
    dates = business_dates(start, len(log_returns))
    return _build_ohlcv(log_returns, base_price, rng, dates, base_volume)


def build_all() -> dict[str, pd.DataFrame]:
    """全 5 銘柄分の OHLCV を辞書で返す。

    Returns:
        ``{symbol: ohlcv_dataframe}`` の辞書。
    """
    return {symbol: generate_ohlcv(symbol) for symbol in SYMBOL_REGIMES}


def max_drawdown_pct(close: pd.Series) -> float:
    """``Close`` 系列の最大ドローダウンを百分率（負値）で返す。

    Args:
        close: 終値系列。

    Returns:
        最大ドローダウン（例: -38.5）。負方向に大きいほど深い。
    """
    if len(close) < 2:
        return 0.0
    running_peak = close.cummax()
    drawdown = (close - running_peak) / running_peak * 100.0
    return float(drawdown.min())
