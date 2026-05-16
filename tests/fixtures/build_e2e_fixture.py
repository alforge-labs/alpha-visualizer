"""Playwright E2E 用の最小フィクスチャ forge_dir を生成する再現スクリプト。

実行方法:
    uv run python tests/fixtures/build_e2e_fixture.py

出力:
    frontend/e2e/fixtures/forge/
      ├── forge.yaml
      └── data/
          ├── results/backtest_results.db
          ├── strategies/{sma_cross,rsi_reversal,momo_breakout}.json
          └── ideas/ideas.json

スクリプトは決定論的（乱数 seed 固定）で、同じ DB バイト列を再生成する。
DB サイズは < 100KB に収まる規模。
"""
from __future__ import annotations

import json
import math
import pathlib
import random
import sys
from datetime import date, timedelta

from sqlalchemy import create_engine, insert

# プロジェクトルートを sys.path に通して alpha_visualizer.db のテーブル定義を流用する。
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from alpha_visualizer.db import (  # noqa: E402
    backtest_results,
    metadata,
    optimization_runs,
)

OUTPUT_DIR = ROOT / "frontend" / "e2e" / "fixtures" / "forge"
DB_PATH = OUTPUT_DIR / "data" / "results" / "backtest_results.db"
STRATEGIES_DIR = OUTPUT_DIR / "data" / "strategies"
IDEAS_PATH = OUTPUT_DIR / "data" / "ideas" / "ideas.json"
YAML_PATH = OUTPUT_DIR / "forge.yaml"
HISTORICAL_DIR = OUTPUT_DIR / "data" / "historical"
HISTORICAL_PARQUET = HISTORICAL_DIR / "SPY_1d.parquet"

PERIOD_START = date(2024, 1, 2)
PERIOD_DAYS = 60
INITIAL_EQUITY = 100_000.0


def _business_dates(start: date, n: int) -> list[date]:
    out: list[date] = []
    current = start
    while len(out) < n:
        if current.weekday() < 5:
            out.append(current)
        current += timedelta(days=1)
    return out


def _equity_curve(seed: int, drift: float, volatility: float) -> list[dict[str, object]]:
    """日次リターンから等価曲線を生成する。"""
    rng = random.Random(seed)  # noqa: S311 — テストデータ生成用、暗号用途ではない
    dates = _business_dates(PERIOD_START, PERIOD_DAYS)
    value = INITIAL_EQUITY
    out: list[dict[str, object]] = []
    for d in dates:
        ret = rng.gauss(drift, volatility)
        value *= 1.0 + ret
        out.append({"date": d.isoformat(), "value": round(value, 2)})
    return out


def _buy_hold_curve() -> list[dict[str, object]]:
    """ベンチマーク用のバイ&ホールド曲線（決定論的）。"""
    rng = random.Random(99)  # noqa: S311
    dates = _business_dates(PERIOD_START, PERIOD_DAYS)
    value = INITIAL_EQUITY
    out: list[dict[str, object]] = []
    for d in dates:
        ret = rng.gauss(0.0004, 0.008)
        value *= 1.0 + ret
        out.append({"date": d.isoformat(), "value": round(value, 2)})
    return out


def _trades(seed: int, equity: list[dict[str, object]]) -> list[dict[str, object]]:
    rng = random.Random(seed)  # noqa: S311
    n_trades = 8
    out: list[dict[str, object]] = []
    if len(equity) < 4:
        return out
    for i in range(n_trades):
        entry_idx = (i * 6 + 1) % (len(equity) - 3)
        exit_idx = entry_idx + rng.randint(2, 5)
        if exit_idx >= len(equity):
            exit_idx = len(equity) - 1
        entry = equity[entry_idx]
        exit_ = equity[exit_idx]
        entry_value = float(entry["value"])
        exit_value = float(exit_["value"])
        return_pct = (exit_value - entry_value) / entry_value * 100.0
        out.append(
            {
                "id": i + 1,
                "direction": "long",
                "entry_date": entry["date"],
                "exit_date": exit_["date"],
                "entry_price": round(entry_value / 1000.0, 2),
                "exit_price": round(exit_value / 1000.0, 2),
                "return_pct": round(return_pct, 4),
                "pnl": round((exit_value - entry_value) / 100.0, 2),
                "holding_days": exit_idx - entry_idx,
                "mae_pct": round(rng.uniform(-2.0, -0.2), 4),
                "mfe_pct": round(rng.uniform(0.5, 3.5), 4),
            }
        )
    return out


def _metrics(equity: list[dict[str, object]], trades: list[dict[str, object]]) -> dict[str, object]:
    values = [float(p["value"]) for p in equity]
    if len(values) < 2:
        return {}
    total_return_pct = (values[-1] - values[0]) / values[0] * 100.0
    daily_returns = [
        (values[i] - values[i - 1]) / values[i - 1]
        for i in range(1, len(values))
    ]
    mean = sum(daily_returns) / len(daily_returns)
    variance = sum((r - mean) ** 2 for r in daily_returns) / len(daily_returns)
    std = math.sqrt(variance) if variance > 0 else 1e-9
    sharpe = (mean / std) * math.sqrt(252)
    downside = [r for r in daily_returns if r < 0]
    if downside:
        d_var = sum(r * r for r in downside) / len(downside)
        d_std = math.sqrt(d_var) if d_var > 0 else 1e-9
        sortino = (mean / d_std) * math.sqrt(252)
    else:
        sortino = sharpe * 1.2
    peak = values[0]
    max_dd = 0.0
    for v in values:
        if v > peak:
            peak = v
        dd = (v - peak) / peak * 100.0
        if dd < max_dd:
            max_dd = dd
    cagr = ((values[-1] / values[0]) ** (252.0 / len(values)) - 1.0) * 100.0
    calmar = cagr / abs(max_dd) if max_dd != 0 else 0.0
    wins = [t for t in trades if float(t["return_pct"]) > 0]
    losses = [t for t in trades if float(t["return_pct"]) <= 0]
    win_rate = len(wins) / len(trades) * 100.0 if trades else 0.0
    gross_profit = sum(float(t["return_pct"]) for t in wins)
    gross_loss = abs(sum(float(t["return_pct"]) for t in losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0.0
    avg_holding = (
        sum(int(t["holding_days"]) for t in trades) / len(trades) if trades else 0.0
    )
    monthly_returns: dict[str, float] = {}
    by_month: dict[str, list[float]] = {}
    for i, p in enumerate(equity):
        d = str(p["date"])[:7]
        if i == 0:
            continue
        prev = float(equity[i - 1]["value"])
        curr = float(p["value"])
        ret = (curr - prev) / prev * 100.0
        by_month.setdefault(d, []).append(ret)
    for month, rets in by_month.items():
        compounded = 1.0
        for r in rets:
            compounded *= 1.0 + r / 100.0
        monthly_returns[month] = round((compounded - 1.0) * 100.0, 4)
    annual_returns = {str(equity[0]["date"])[:4]: round(total_return_pct, 4)}
    return {
        "total_return_pct": round(total_return_pct, 4),
        "cagr_pct": round(cagr, 4),
        "sharpe_ratio": round(sharpe, 4),
        "sortino_ratio": round(sortino, 4),
        "calmar_ratio": round(calmar, 4),
        "max_drawdown_pct": round(max_dd, 4),
        "win_rate_pct": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "total_trades": len(trades),
        "avg_holding_days": round(avg_holding, 4),
        "monthly_returns": monthly_returns,
        "annual_returns": annual_returns,
    }


def _strategy_definition(strategy_id: str, name: str, params: dict[str, object]) -> dict[str, object]:
    return {
        "strategy_id": strategy_id,
        "name": name,
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": "1d",
        "tags": ["e2e-fixture"],
        "target_symbols": ["SPY"],
        "parameters": params,
        "indicators": [
            {"name": "sma_fast", "type": "SMA", "params": {"period": 10}},
            {"name": "sma_slow", "type": "SMA", "params": {"period": 30}},
        ],
        "variables": [],
        "entry_conditions": {"long": "sma_fast > sma_slow"},
        "exit_conditions": {"long": "sma_fast < sma_slow"},
        "risk_management": {"stop_loss_pct": 5.0, "take_profit_pct": 15.0},
    }


def _opt_trials(seed: int, n: int) -> list[dict[str, object]]:
    rng = random.Random(seed)  # noqa: S311
    out: list[dict[str, object]] = []
    for i in range(n):
        out.append(
            {
                "trial": i + 1,
                "params": {
                    "fast_period": rng.randint(5, 20),
                    "slow_period": rng.randint(20, 60),
                },
                "metric_value": round(rng.uniform(0.4, 1.8), 4),
            }
        )
    return out


def _wfo_trials(seed: int) -> list[dict[str, object]]:
    """ウォークフォワード形式のトライアル列（WFOScreen 描画用）。

    WFO ルーターが期待するキー（``window_id`` / ``is_sharpe`` / ``oos_sharpe``
    / ``is_start`` / ``is_end`` / ``oos_start`` / ``oos_end`` / ``params``）を
    含む 2 ウィンドウ分のシーケンスを決定論的に生成する。
    """
    rng = random.Random(seed)  # noqa: S311
    dates = _business_dates(PERIOD_START, PERIOD_DAYS)
    # 60 営業日を 2 ウィンドウに分割（前半=Window1、後半=Window2）。
    # 各ウィンドウ内で IS:OOS = 2:1 の比率で切る（IS=20 営業日, OOS=10 営業日）。
    half = len(dates) // 2  # 30
    is_len = (half * 2) // 3  # 20
    windows: list[dict[str, object]] = []
    for w in range(2):
        offset = w * half
        is_start = dates[offset]
        is_end = dates[offset + is_len - 1]
        oos_start = dates[offset + is_len]
        oos_end = dates[offset + half - 1]
        is_sharpe = round(rng.uniform(0.8, 1.6), 4)
        oos_sharpe = round(rng.uniform(0.3, 1.2), 4)
        windows.append(
            {
                "window_id": w + 1,
                "label": f"W{w + 1}",
                "is_start": is_start.isoformat(),
                "is_end": is_end.isoformat(),
                "oos_start": oos_start.isoformat(),
                "oos_end": oos_end.isoformat(),
                "is_sharpe": is_sharpe,
                "oos_sharpe": oos_sharpe,
                "is_return_pct": round(rng.uniform(2.0, 8.0), 4),
                "oos_return_pct": round(rng.uniform(-2.0, 5.0), 4),
                "params": {
                    "fast_period": rng.randint(5, 20),
                    "slow_period": rng.randint(20, 60),
                },
                "pass": oos_sharpe > 0.5,
            }
        )
    return windows


def _ensure_dirs() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    STRATEGIES_DIR.mkdir(parents=True, exist_ok=True)
    IDEAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    HISTORICAL_DIR.mkdir(parents=True, exist_ok=True)


def _write_yaml() -> None:
    YAML_PATH.write_text(
        "# E2E フィクスチャ用の最小 forge.yaml（再生成は build_e2e_fixture.py から）\n"
        "report:\n"
        "  output_path: ./data/results\n"
        "  db_filename: backtest_results.db\n"
        "strategies:\n"
        "  path: ./data/strategies\n"
        "  use_db: false\n"
        "ideas:\n"
        "  ideas_path: ./data/ideas\n"
        "data:\n"
        "  storage_path: ./data/historical\n",
        encoding="utf-8",
    )


def _write_historical_parquet() -> None:
    """SPY_1d.parquet を決定論的に生成する（issue #189）。

    OHLC + Volume × 60 営業日。圧縮後 ~3KB に収まる規模。
    """
    import pandas as pd  # ローカル import: スクリプト本体の依存範囲を最小化

    rng = random.Random(7)  # noqa: S311 — フィクスチャ生成用、暗号用途ではない
    dates = _business_dates(PERIOD_START, PERIOD_DAYS)
    rows: list[dict[str, float]] = []
    price = 400.0
    for _ in dates:
        o = price * (1 + rng.gauss(0, 0.003))
        c = o * (1 + rng.gauss(0, 0.008))
        h = max(o, c) * (1 + abs(rng.gauss(0, 0.004)))
        low_val = min(o, c) * (1 - abs(rng.gauss(0, 0.004)))
        rows.append(
            {
                "Open": round(o, 4),
                "High": round(h, 4),
                "Low": round(low_val, 4),
                "Close": round(c, 4),
                "Volume": float(rng.randint(1_000_000, 5_000_000)),
            }
        )
        price = c
    df = pd.DataFrame(
        rows,
        index=pd.DatetimeIndex(
            [pd.Timestamp(d) for d in dates], name="Date"
        ),
    )
    df.to_parquet(HISTORICAL_PARQUET)


def _write_strategies() -> None:
    sma_cross = _strategy_definition(
        "sma_cross",
        "SMA Cross",
        {"fast_period": 10, "slow_period": 30},
    )
    rsi_reversal = _strategy_definition(
        "rsi_reversal",
        "RSI Reversal",
        {"rsi_period": 14, "oversold": 30, "overbought": 70},
    )
    momo_breakout = _strategy_definition(
        "momo_breakout",
        "Momentum Breakout",
        {"lookback": 20, "threshold_pct": 2.5},
    )
    for sid, payload in (
        ("sma_cross", sma_cross),
        ("rsi_reversal", rsi_reversal),
        ("momo_breakout", momo_breakout),
    ):
        path = STRATEGIES_DIR / f"{sid}.json"
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _write_ideas() -> None:
    payload = [
        {
            "idea_id": "idea_e2e_001",
            "title": "E2E スモーク用ダミーアイデア",
            "status": "draft",
            "tags": ["e2e-fixture"],
            "created_at": "2024-01-02T00:00:00",
        }
    ]
    IDEAS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _build_backtest_row(
    strategy_id: str,
    seed: int,
    drift: float,
    volatility: float,
    run_at: str,
) -> dict[str, object]:
    equity = _equity_curve(seed, drift, volatility)
    bh = _buy_hold_curve()
    trades = _trades(seed + 1000, equity)
    metrics = _metrics(equity, trades)
    oos_idx = len(equity) // 2
    oos_start = str(equity[oos_idx]["date"])
    return {
        "run_id": f"e2e_{strategy_id}_001",
        "strategy_id": strategy_id,
        "symbol": "SPY",
        "run_at": run_at,
        "total_return_pct": float(metrics["total_return_pct"]),
        "cagr_pct": float(metrics["cagr_pct"]),
        "sharpe_ratio": float(metrics["sharpe_ratio"]),
        "sortino_ratio": float(metrics["sortino_ratio"]),
        "calmar_ratio": float(metrics["calmar_ratio"]),
        "max_drawdown_pct": float(metrics["max_drawdown_pct"]),
        "total_trades": int(metrics["total_trades"]),
        "win_rate_pct": float(metrics["win_rate_pct"]),
        "profit_factor": float(metrics["profit_factor"]),
        "avg_holding_days": float(metrics["avg_holding_days"]),
        "metrics_json": json.dumps(metrics, ensure_ascii=False, sort_keys=True),
        "equity_curve_json": json.dumps(equity, ensure_ascii=False),
        "buy_hold_curve_json": json.dumps(bh, ensure_ascii=False),
        "trades_json": json.dumps(trades, ensure_ascii=False),
        "oos_start": oos_start,
    }


def _build_optimization_row(strategy_id: str, run_at: str) -> dict[str, object]:
    trials = _opt_trials(seed=42, n=20)
    best = max(trials, key=lambda t: float(t["metric_value"]))
    return {
        "run_id": f"opt_{strategy_id}_001",
        "strategy_id": strategy_id,
        "symbol": "SPY",
        "run_at": run_at,
        "n_trials": len(trials),
        "best_metric_name": "sharpe_ratio",
        "best_metric_value": float(best["metric_value"]),
        "best_params_json": json.dumps(best["params"], ensure_ascii=False, sort_keys=True),
        "duration_seconds": 12.34,
        "all_trials_json": json.dumps(trials, ensure_ascii=False),
    }


def _build_wfo_optimization_row(strategy_id: str, run_at: str) -> dict[str, object]:
    """sma_cross 用 WFO 形式の optimization_runs 行を生成する。

    ``all_trials_json`` には WFO ルーターが期待するウィンドウ列（``window_id``
    / ``is_sharpe`` / ``oos_sharpe`` / ``is_start`` / ``oos_start`` 等）が入る。
    Detail 画面の WFO タブでこの行が拾われ ``WFOScreen`` が描画される。
    """
    windows = _wfo_trials(seed=11)
    best = max(windows, key=lambda w: float(w["oos_sharpe"]))
    return {
        "run_id": f"wfo_{strategy_id}_001",
        "strategy_id": strategy_id,
        "symbol": "SPY",
        "run_at": run_at,
        "n_trials": len(windows),
        "best_metric_name": "oos_sharpe",
        "best_metric_value": float(best["oos_sharpe"]),
        "best_params_json": json.dumps(best["params"], ensure_ascii=False, sort_keys=True),
        "duration_seconds": 8.21,
        "all_trials_json": json.dumps(windows, ensure_ascii=False),
    }


def _write_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    engine = create_engine(f"sqlite:///{DB_PATH}", future=True)
    metadata.create_all(engine, tables=[backtest_results, optimization_runs])
    rows = [
        _build_backtest_row("sma_cross", seed=1, drift=0.0008, volatility=0.012, run_at="2024-04-01T10:00:00"),
        _build_backtest_row("rsi_reversal", seed=2, drift=0.0006, volatility=0.014, run_at="2024-04-02T10:00:00"),
        _build_backtest_row("momo_breakout", seed=3, drift=0.0010, volatility=0.018, run_at="2024-04-03T10:00:00"),
    ]
    opt_rows = [
        _build_optimization_row("rsi_reversal", "2024-04-02T11:00:00"),
        _build_wfo_optimization_row("sma_cross", "2024-04-01T11:00:00"),
    ]
    with engine.begin() as conn:
        conn.execute(insert(backtest_results), rows)
        conn.execute(insert(optimization_runs), opt_rows)


def main() -> None:
    _ensure_dirs()
    _write_yaml()
    _write_strategies()
    _write_ideas()
    _write_db()
    _write_historical_parquet()
    size = DB_PATH.stat().st_size
    parquet_size = HISTORICAL_PARQUET.stat().st_size
    print(f"[ok] backtest_results.db generated: {DB_PATH} ({size} bytes)")
    print(f"[ok] strategies dir: {STRATEGIES_DIR}")
    print(f"[ok] ideas: {IDEAS_PATH}")
    print(f"[ok] yaml: {YAML_PATH}")
    print(f"[ok] historical parquet: {HISTORICAL_PARQUET} ({parquet_size} bytes)")
    if size > 1_000_000:
        raise SystemExit(f"backtest_results.db exceeds 1MB ({size} bytes); shrink the fixture")
    if parquet_size > 100_000:
        raise SystemExit(
            f"historical parquet exceeds 100KB ({parquet_size} bytes); shrink the fixture"
        )


if __name__ == "__main__":  # pragma: no cover
    main()
