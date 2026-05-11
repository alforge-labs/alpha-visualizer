"""Walk-Forward Optimization (WFO) 擬似結果の生成器。

採用ペアは 2 件:

- ``sma_crossover_v1 × EQUITY_SYNTH``  : IS/OOS の乖離が穏やかで、安定して pass する想定
- ``supertrend_adx_v1 × CRYPTO_SYNTH`` : 高ボラ銘柄ゆえ IS と OOS の乖離が大きめ

各ラン 6 ウィンドウ（IS=600d / OOS=200d / step=90d）。1250 営業日 ≒ 5 年の中に
6 ウィンドウを収めるために step は 90 日にしている。フロント側の WFO 画面が期待する
キー（``window_id`` / ``is_sharpe`` / ``oos_sharpe`` / ``is_start`` / ``is_end`` /
``oos_start`` / ``oos_end`` / ``params`` / ``pass``）を満たす。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from samples._generators.compatibility_matrix import pair_seed

WFO_PAIRS: tuple[tuple[str, str], ...] = (
    ("sma_crossover_v1", "EQUITY_SYNTH"),
    ("supertrend_adx_v1", "CRYPTO_SYNTH"),
)


@dataclass(frozen=True)
class WFORun:
    """WFO 形式の 1 件の擬似ラン。

    ``optimization_runs`` テーブル 1 行に相当する。
    """

    run_id: str
    strategy_id: str
    symbol: str
    n_trials: int  # ウィンドウ数
    best_metric_name: str
    best_metric_value: float
    best_params: dict[str, Any]
    all_trials: list[dict[str, Any]]
    duration_seconds: float
    run_at: str = ""


# 戦略ごとの「真の最適パラメータ」と探索レンジ。
_WFO_PARAM_SPACE: dict[str, dict[str, Any]] = {
    "sma_crossover_v1": {
        "ranges": {"fast_period": (5, 20), "slow_period": (20, 60)},
        "true_optimum": {"fast_period": 12, "slow_period": 36},
    },
    "supertrend_adx_v1": {
        "ranges": {
            "st_length": (5, 20),
            "st_multiplier": (1.5, 4.5),
            "adx_threshold": (15.0, 30.0),
        },
        "true_optimum": {
            "st_length": 10,
            "st_multiplier": 3.0,
            "adx_threshold": 20.0,
        },
    },
}


def _sample_params_near_optimum(
    strategy_id: str,
    rng: np.random.Generator,
    spread: float,
) -> dict[str, Any]:
    """``true_optimum`` の周りに ``spread`` の幅で揺らしたパラメータを返す。

    Args:
        strategy_id: 対象戦略。
        rng: 乱数ジェネレータ。
        spread: 0.0=完全に最適から離れない、1.0=レンジ全幅。
    """
    space = _WFO_PARAM_SPACE[strategy_id]
    ranges = space["ranges"]
    optimum = space["true_optimum"]
    out: dict[str, Any] = {}
    for key, (lo, hi) in ranges.items():
        opt_value = optimum[key]
        width = (hi - lo) * spread
        candidate = float(rng.uniform(opt_value - width, opt_value + width))
        candidate = max(lo, min(hi, candidate))
        if isinstance(opt_value, int):
            out[key] = int(round(candidate))
        else:
            out[key] = round(candidate, 2)
    return out


def _window_metrics(
    is_strength: float,
    oos_gap: float,
    rng: np.random.Generator,
) -> tuple[float, float, float, float]:
    """IS / OOS の sharpe と return を生成する。

    Args:
        is_strength: IS 側の基本強度（0.0=低 → 1.0=高）。
        oos_gap: OOS で乖離が出るスケール（0.0=同一、1.0=大きく乖離）。

    Returns:
        ``(is_sharpe, oos_sharpe, is_return_pct, oos_return_pct)``。
    """
    is_sharpe = float(0.6 + is_strength * 1.0 + rng.normal(0.0, 0.10))
    # CRYPTO 等の不安定銘柄は OOS で大きく減衰する
    oos_decay = float(rng.uniform(0.10, 0.45) * oos_gap)
    if oos_gap >= 1.0:
        # 大乖離の確率的な発生（30% の確率で 0.6-1.2 のさらなる減衰を追加）
        if rng.random() < 0.30:
            oos_decay += float(rng.uniform(0.60, 1.20))
    oos_sharpe = max(-0.4, is_sharpe - oos_decay)
    is_return = float(8.0 + is_strength * 10.0 + rng.normal(0.0, 2.0))
    oos_return = max(-8.0, is_return - oos_decay * 8.0)
    return is_sharpe, oos_sharpe, is_return, oos_return


def _build_windows(
    strategy_id: str,
    symbol: str,
    ohlcv: pd.DataFrame,
    rng: np.random.Generator,
) -> list[dict[str, Any]]:
    """ペア固有の 6 ウィンドウを作る。"""
    n = len(ohlcv)
    is_days = 600
    oos_days = 200
    step = 90  # 5 * 90 + 600 + 200 - 1 = 1249 ≤ n-1=1249（営業日 1250）
    n_windows = 6
    # CRYPTO 向けは「不安定」を表現するため oos_gap を大きめに。
    oos_gap = 1.0 if symbol == "CRYPTO_SYNTH" else 0.5
    windows: list[dict[str, Any]] = []
    for w in range(n_windows):
        is_start_idx = w * step
        is_end_idx = is_start_idx + is_days - 1
        oos_start_idx = is_end_idx + 1
        oos_end_idx = oos_start_idx + oos_days - 1
        # 万一データ末尾を超えた場合は末尾までクランプ
        is_end_idx = min(is_end_idx, n - oos_days - 1)
        oos_end_idx = min(oos_end_idx, n - 1)
        # IS 強度はウィンドウ後半ほど安定するよう微増させる
        is_strength = float(rng.uniform(0.35, 0.85)) + 0.05 * w
        is_strength = min(is_strength, 1.2)
        # パラメータは後ろのウィンドウほど optimum 近傍に収束（spread を縮める）
        spread = max(0.1, 0.5 - 0.05 * w)
        params = _sample_params_near_optimum(strategy_id, rng, spread=spread)
        is_sharpe, oos_sharpe, is_ret, oos_ret = _window_metrics(
            is_strength=is_strength,
            oos_gap=oos_gap,
            rng=rng,
        )
        windows.append(
            {
                "window_id": w + 1,
                "label": f"W{w + 1}",
                "is_start": ohlcv.index[is_start_idx].date().isoformat(),
                "is_end": ohlcv.index[is_end_idx].date().isoformat(),
                "oos_start": ohlcv.index[oos_start_idx].date().isoformat(),
                "oos_end": ohlcv.index[oos_end_idx].date().isoformat(),
                "is_sharpe": round(is_sharpe, 4),
                "oos_sharpe": round(oos_sharpe, 4),
                "is_return_pct": round(is_ret, 4),
                "oos_return_pct": round(oos_ret, 4),
                "params": params,
                "pass": bool(oos_sharpe > 0.5),
            }
        )
    return windows


def _run_at_for_wfo(strategy_id: str, symbol: str) -> str:
    base_day = pd.Timestamp("2025-01-08 14:00:00")
    seed = pair_seed(strategy_id, symbol, base=500)
    delta_hours = seed % 96
    return (base_day + pd.Timedelta(hours=int(delta_hours))).isoformat()


def generate_wfo_run(
    strategy_id: str,
    symbol: str,
    ohlcv: pd.DataFrame,
) -> WFORun:
    """指定ペアの WFO ランを生成する。"""
    if (strategy_id, symbol) not in WFO_PAIRS:
        raise KeyError(
            f"WFO pair not registered: ({strategy_id!r}, {symbol!r})"
        )
    seed = pair_seed(strategy_id, symbol, base=500)
    rng = np.random.default_rng(seed)
    windows = _build_windows(strategy_id, symbol, ohlcv, rng)
    best_window = max(windows, key=lambda w: float(w["oos_sharpe"]))
    return WFORun(
        run_id=f"wfo_{strategy_id}_{symbol}_001",
        strategy_id=strategy_id,
        symbol=symbol,
        n_trials=len(windows),
        best_metric_name="oos_sharpe",
        best_metric_value=float(best_window["oos_sharpe"]),
        best_params=dict(best_window["params"]),
        all_trials=windows,
        duration_seconds=round(float(rng.uniform(5.0, 30.0)), 2),
        run_at=_run_at_for_wfo(strategy_id, symbol),
    )


def build_all_wfo(ohlcv_dict: dict[str, pd.DataFrame]) -> list[WFORun]:
    """登録済み WFO ペアすべてのランを返す。"""
    return [generate_wfo_run(sid, sym, ohlcv_dict[sym]) for sid, sym in WFO_PAIRS]
