"""擬似バックテスト生成器。

40 ペア (8 戦略 × 5 銘柄) について、相性マトリクスの skill 係数と戦略プロファイル
（トレード頻度・平均保有日数）から決定論的に以下を組み立てる:

- ``equity_curve``    : 1250 営業日の equity 推移
- ``buy_hold_curve``  : 同期間のバイ＆ホールド比較曲線
- ``trades``          : 戦略タイプに応じた本数の擬似トレード
- ``metrics``         : Sharpe / Sortino / Calmar / MDD / win_rate / profit_factor 等

`alpha_forge` には依存せず、``numpy`` / ``pandas`` だけで完結する。同じ呼び出しで
同じ結果が出るよう ``(strategy_id, symbol)`` ごとに決定論的な seed を使う。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from samples._generators.compatibility_matrix import (
    StrategyProfile,
    get_profile,
    get_skill,
    pair_seed,
)
from samples._generators.strategy_defs import list_ids
from samples._generators.synthetic_ohlcv import SYMBOL_REGIMES

INITIAL_EQUITY: float = 100_000.0
"""バックテスト開始時の初期資金（全戦略・全銘柄で共通）。"""


@dataclass(frozen=True)
class BacktestRun:
    """1 つの擬似バックテストランの結果。

    Attributes:
        run_id: 一意なラン ID。``bt_<strategy>_<symbol>_001`` 形式。
        strategy_id: 戦略 ID。
        symbol: 銘柄シンボル（``_SYNTH`` サフィックス必須）。
        equity_curve: ``[{"date": "YYYY-MM-DD", "value": float}, ...]``。
        buy_hold_curve: 同期間のバイ＆ホールド曲線（同形式）。
        trades: トレードリスト（``id`` / ``direction`` / ``entry_date`` / ``exit_date`` /
            ``entry_price`` / ``exit_price`` / ``return_pct`` / ``pnl`` /
            ``holding_days`` / ``mae_pct`` / ``mfe_pct``）。
        metrics: 集計メトリクス。``sharpe_ratio`` / ``max_drawdown_pct`` 等。
        oos_start: OOS 期間の開始日。デフォルトは期間中央（``YYYY-MM-DD`` 文字列）。
        run_at: ラン実行時刻（ISO8601）。
    """

    run_id: str
    strategy_id: str
    symbol: str
    equity_curve: list[dict[str, Any]]
    buy_hold_curve: list[dict[str, Any]]
    trades: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    oos_start: str = ""
    run_at: str = ""


def _skill_signed(skill: float) -> float:
    """``[0.0, 1.0]`` の skill を ``[-1.0, 1.0]`` の signed skill にマップする。"""
    return (skill - 0.5) * 2.0


def _build_equity(
    n_days: int,
    skill: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """skill から擬似的な equity 曲線を生成する。

    - skill が高いほど drift が正方向に大きく、ボラは低くなる
    - skill が ``< 0.6`` の戦略には期間中ランダムな位置に意図的な大ドローダウンを挿入

    Args:
        n_days: 日次ステップ数。
        skill: ``[0.0, 1.0]`` の skill 係数。
        rng: 乱数ジェネレータ（呼び出し側で seed 済み）。

    Returns:
        ``shape=(n_days,)`` の equity 系列。
    """
    s = _skill_signed(skill)
    base_drift = 0.0009 * s  # skill=1.0 で年率 +約 26%、skill=0.0 で 約 -23%
    base_vol = 0.011 * (1.0 - 0.35 * s)  # skill が良いほど vol が下がる
    log_ret = rng.normal(base_drift, base_vol, size=n_days)
    # 大ドローダウン区間の挿入（skill < 0.5 のみ、過度な深掘りは抑制）
    if skill < 0.5:
        severity = 0.5 - skill  # [0.0, 0.5]
        dd_start_frac = float(rng.uniform(0.20, 0.70))
        dd_start = int(n_days * dd_start_frac)
        dd_length = int(60 + severity * 80)  # 60-100 日
        dd_end = min(dd_start + dd_length, n_days)
        log_ret[dd_start:dd_end] -= 0.005 * severity
    return INITIAL_EQUITY * np.exp(np.cumsum(log_ret))


def _build_trades(
    ohlcv: pd.DataFrame,
    skill: float,
    profile: StrategyProfile,
    rng: np.random.Generator,
) -> list[dict[str, Any]]:
    """skill とプロファイルから擬似トレード列を生成する。

    トレード本数は ``profile.n_trades_per_5y * Uniform(0.9, 1.1)``、勝率は
    ``0.42 + skill * 0.22``（skill=0 → 42%、skill=1.0 → 64%）に従って勝敗を決める。
    """
    n = len(ohlcv)
    target = int(profile.n_trades_per_5y * rng.uniform(0.9, 1.1))
    if target < 2:
        return []
    holding = profile.avg_holding_days
    spacing = max(2.0, (n - holding - 5) / target)
    win_rate = 0.42 + skill * 0.22
    closes = ohlcv["Close"].to_numpy()
    dates = ohlcv.index
    trades: list[dict[str, Any]] = []
    for i in range(target):
        entry_idx = int(i * spacing + rng.uniform(0.0, spacing * 0.3))
        if entry_idx >= n - 2:
            break
        hold_actual = max(1, int(rng.normal(holding, max(1.0, holding * 0.3))))
        exit_idx = min(entry_idx + hold_actual, n - 1)
        is_win = bool(rng.random() < win_rate)
        if is_win:
            ret_pct = float(rng.uniform(0.5, 4.0))
        else:
            ret_pct = -float(rng.uniform(0.3, 3.0))
        entry_price = float(closes[entry_idx])
        exit_price = entry_price * (1.0 + ret_pct / 100.0)
        # 仮想的な PnL: $10k のポジションサイズと仮定（数値感だけ整える）
        pnl = (exit_price - entry_price) * 10000.0 / entry_price
        trades.append(
            {
                "id": i + 1,
                "direction": "long",
                "entry_date": dates[entry_idx].date().isoformat(),
                "exit_date": dates[exit_idx].date().isoformat(),
                "entry_price": round(entry_price, 4),
                "exit_price": round(exit_price, 4),
                "return_pct": round(ret_pct, 4),
                "pnl": round(pnl, 2),
                "holding_days": int(exit_idx - entry_idx),
                "mae_pct": round(-float(rng.uniform(0.2, 3.0)), 4),
                "mfe_pct": round(float(rng.uniform(0.5, 4.5)), 4),
            }
        )
    return trades


def _compute_metrics(
    equity: np.ndarray,
    trades: list[dict[str, Any]],
    dates: pd.DatetimeIndex,
) -> dict[str, Any]:
    """equity 系列とトレード列から集計メトリクスを返す。"""
    if len(equity) < 2:
        return {}
    total_return_pct = float((equity[-1] - equity[0]) / equity[0] * 100.0)
    daily_ret = np.diff(equity) / equity[:-1]
    mean = float(np.mean(daily_ret))
    std = float(np.std(daily_ret))
    sharpe = (mean / std) * math.sqrt(252) if std > 0 else 0.0
    downside = daily_ret[daily_ret < 0]
    if downside.size > 0:
        d_std = float(np.std(downside))
        sortino = (mean / d_std) * math.sqrt(252) if d_std > 0 else sharpe * 1.2
    else:
        sortino = sharpe * 1.2
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak * 100.0
    max_dd = float(drawdown.min())
    years = max(len(equity) / 252.0, 1e-6)
    cagr = float((equity[-1] / equity[0]) ** (1.0 / years) - 1.0) * 100.0
    calmar = cagr / abs(max_dd) if max_dd != 0.0 else 0.0
    wins = [t for t in trades if float(t["return_pct"]) > 0]
    losses = [t for t in trades if float(t["return_pct"]) <= 0]
    win_rate = len(wins) / len(trades) * 100.0 if trades else 0.0
    gross_profit = sum(float(t["return_pct"]) for t in wins)
    gross_loss = abs(sum(float(t["return_pct"]) for t in losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0.0
    avg_holding = (
        sum(int(t["holding_days"]) for t in trades) / len(trades) if trades else 0.0
    )
    monthly: dict[str, float] = {}
    by_month: dict[str, list[float]] = {}
    annual: dict[str, float] = {}
    by_year: dict[str, list[float]] = {}
    for i in range(1, len(equity)):
        month_key = dates[i].strftime("%Y-%m")
        year_key = dates[i].strftime("%Y")
        ret = (equity[i] - equity[i - 1]) / equity[i - 1]
        by_month.setdefault(month_key, []).append(float(ret))
        by_year.setdefault(year_key, []).append(float(ret))
    for month, rets in by_month.items():
        compounded = 1.0
        for r in rets:
            compounded *= 1.0 + r
        monthly[month] = round((compounded - 1.0) * 100.0, 4)
    for year, rets in by_year.items():
        compounded = 1.0
        for r in rets:
            compounded *= 1.0 + r
        annual[year] = round((compounded - 1.0) * 100.0, 4)
    return {
        "total_return_pct": round(total_return_pct, 4),
        "cagr_pct": round(cagr, 4),
        "sharpe_ratio": round(sharpe, 4),
        "sortino_ratio": round(sortino, 4),
        "calmar_ratio": round(calmar, 4),
        "max_drawdown_pct": round(max_dd, 4),
        "win_rate_pct": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "total_trades": int(len(trades)),
        "avg_holding_days": round(avg_holding, 4),
        "monthly_returns": monthly,
        "annual_returns": annual,
    }


def _run_at(strategy_id: str, symbol: str) -> str:
    """ラン実行時刻文字列を ``(strategy_id, symbol)`` から決定論的に組み立てる。"""
    base_day = pd.Timestamp("2025-01-06 09:00:00")
    seed = pair_seed(strategy_id, symbol)
    delta_hours = seed % 200
    return (base_day + pd.Timedelta(hours=int(delta_hours))).isoformat()


def generate_run(
    strategy_id: str,
    symbol: str,
    ohlcv: pd.DataFrame,
) -> BacktestRun:
    """1 つの ``(strategy_id, symbol)`` ペアのバックテストランを生成する。"""
    skill = get_skill(strategy_id, symbol)
    profile = get_profile(strategy_id)
    seed = pair_seed(strategy_id, symbol)
    rng = np.random.default_rng(seed)
    equity = _build_equity(len(ohlcv), skill, rng)
    trades = _build_trades(ohlcv, skill, profile, rng)
    metrics = _compute_metrics(equity, trades, ohlcv.index)
    equity_curve = [
        {"date": d.date().isoformat(), "value": round(float(v), 2)}
        for d, v in zip(ohlcv.index, equity, strict=False)
    ]
    closes = ohlcv["Close"].to_numpy()
    bh = INITIAL_EQUITY * (closes / closes[0])
    buy_hold_curve = [
        {"date": d.date().isoformat(), "value": round(float(v), 2)}
        for d, v in zip(ohlcv.index, bh, strict=False)
    ]
    oos_idx = len(equity) // 2
    oos_start = ohlcv.index[oos_idx].date().isoformat()
    return BacktestRun(
        run_id=f"bt_{strategy_id}_{symbol}_001",
        strategy_id=strategy_id,
        symbol=symbol,
        equity_curve=equity_curve,
        buy_hold_curve=buy_hold_curve,
        trades=trades,
        metrics=metrics,
        oos_start=oos_start,
        run_at=_run_at(strategy_id, symbol),
    )


def build_all_runs(ohlcv_dict: dict[str, pd.DataFrame]) -> list[BacktestRun]:
    """全 40 ペア (8 戦略 × 5 銘柄) のランを定義順で生成する。

    Args:
        ohlcv_dict: 銘柄シンボル → OHLCV DataFrame の辞書。

    Returns:
        40 個の ``BacktestRun`` リスト。
    """
    runs: list[BacktestRun] = []
    for strategy_id in list_ids():
        for symbol in SYMBOL_REGIMES:
            runs.append(generate_run(strategy_id, symbol, ohlcv_dict[symbol]))
    return runs
