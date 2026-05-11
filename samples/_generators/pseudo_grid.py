"""Grid 最適化の擬似結果生成器。

採用ペアは 2 件:

- ``rsi_reversion_v1 × INDEX_SYNTH``       : 5×8 = 40 trial
- ``bbands_breakout_v1 × COMMODITY_SYNTH`` : 7×6 = 42 trial

`metric_value`（Sharpe を想定）は二次関数の山 + ノイズで生成され、フロント側の
ヒートマップで「明確な極値」が見える仕様。
"""

from __future__ import annotations

import itertools
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from samples._generators.compatibility_matrix import pair_seed

GRID_PAIRS: tuple[tuple[str, str], ...] = (
    ("rsi_reversion_v1", "INDEX_SYNTH"),
    ("bbands_breakout_v1", "COMMODITY_SYNTH"),
)


@dataclass(frozen=True)
class GridSpec:
    """Grid 探索のスペック。"""

    param_grids: dict[str, Sequence[float]]
    peak: dict[str, float]
    peak_metric: float
    curvatures: dict[str, float]  # 二次関数の係数（正値で山形状）


_SPECS: dict[tuple[str, str], GridSpec] = {
    ("rsi_reversion_v1", "INDEX_SYNTH"): GridSpec(
        param_grids={
            "rsi_length": (7, 10, 14, 21, 28),
            "oversold": (20, 25, 30, 35, 40, 45, 50, 55),
        },
        peak={"rsi_length": 14, "oversold": 30},
        peak_metric=1.40,
        # curvature は中心 1.4、端で約 -1.0 になるよう校正
        curvatures={"rsi_length": 0.008, "oversold": 0.0015},
    ),
    ("bbands_breakout_v1", "COMMODITY_SYNTH"): GridSpec(
        param_grids={
            "bb_length": (10, 15, 20, 25, 30, 35, 40),
            "bb_std": (1.5, 1.8, 2.0, 2.2, 2.5, 3.0),
        },
        peak={"bb_length": 20, "bb_std": 2.0},
        peak_metric=1.35,
        curvatures={"bb_length": 0.0035, "bb_std": 0.55},
    ),
}


@dataclass(frozen=True)
class GridRun:
    """Grid 形式の 1 件の擬似ラン。"""

    run_id: str
    strategy_id: str
    symbol: str
    n_trials: int
    best_metric_name: str
    best_metric_value: float
    best_params: dict[str, Any]
    all_trials: list[dict[str, Any]]
    duration_seconds: float
    run_at: str = ""


def _trial_metric(spec: GridSpec, params: dict[str, float], noise: float) -> float:
    """二次関数の山 + ノイズで metric を返す。

    ``metric = peak_metric - Σ curvature_i * (param_i - peak_i)^2 + noise``。
    """
    value = spec.peak_metric
    for key, peak_value in spec.peak.items():
        diff = float(params[key]) - float(peak_value)
        value -= spec.curvatures[key] * (diff**2)
    return value + noise


def _trials_for_spec(
    strategy_id: str,
    symbol: str,
    rng: np.random.Generator,
) -> list[dict[str, Any]]:
    """spec から全 trial を生成する。"""
    spec = _SPECS[(strategy_id, symbol)]
    keys = list(spec.param_grids.keys())
    value_lists = [spec.param_grids[k] for k in keys]
    trials: list[dict[str, Any]] = []
    for i, combo in enumerate(itertools.product(*value_lists)):
        params: dict[str, Any] = {}
        for key, value in zip(keys, combo, strict=True):
            params[key] = int(value) if float(value).is_integer() else float(value)
        noise = float(rng.normal(0.0, 0.15))
        metric_value = _trial_metric(spec, params, noise)
        trials.append(
            {
                "trial": i + 1,
                "params": params,
                "metric_value": round(metric_value, 4),
            }
        )
    return trials


def _run_at_for_grid(strategy_id: str, symbol: str) -> str:
    base_day = pd.Timestamp("2025-01-09 11:30:00")
    seed = pair_seed(strategy_id, symbol, base=800)
    delta_hours = seed % 72
    return (base_day + pd.Timedelta(hours=int(delta_hours))).isoformat()


def generate_grid_run(
    strategy_id: str,
    symbol: str,
    ohlcv: pd.DataFrame,  # noqa: ARG001 — 将来のフロント連動のためのシグネチャ統一
) -> GridRun:
    """指定ペアの Grid ランを生成する。"""
    if (strategy_id, symbol) not in GRID_PAIRS:
        raise KeyError(
            f"Grid pair not registered: ({strategy_id!r}, {symbol!r})"
        )
    seed = pair_seed(strategy_id, symbol, base=800)
    rng = np.random.default_rng(seed)
    trials = _trials_for_spec(strategy_id, symbol, rng)
    best = max(trials, key=lambda t: float(t["metric_value"]))
    return GridRun(
        run_id=f"opt_{strategy_id}_{symbol}_001",
        strategy_id=strategy_id,
        symbol=symbol,
        n_trials=len(trials),
        best_metric_name="sharpe_ratio",
        best_metric_value=float(best["metric_value"]),
        best_params=dict(best["params"]),
        all_trials=trials,
        duration_seconds=round(float(rng.uniform(20.0, 90.0)), 2),
        run_at=_run_at_for_grid(strategy_id, symbol),
    )


def build_all_grid(ohlcv_dict: dict[str, pd.DataFrame]) -> list[GridRun]:
    """登録済み Grid ペアすべてのランを返す。"""
    return [generate_grid_run(sid, sym, ohlcv_dict[sym]) for sid, sym in GRID_PAIRS]
