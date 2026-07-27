"""Playwright E2E 用の最小フィクスチャ forge_dir を生成する再現スクリプト。

実行方法:
    uv run python tests/fixtures/build_e2e_fixture.py

出力:
    frontend/e2e/fixtures/forge/
      ├── forge.yaml
      └── data/
          ├── results/backtest_results.db
          ├── strategies/{sma_cross,rsi_reversal,momo_breakout,...}.json
          │   （+ ROLLUP_STRATEGIES 8 件。レシピ・ロールアップ検証用）
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
    live_position_summaries,
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

# Live（ペーパー運用実績）の期間。backtest 期間より短いのは実運用と同じ
# （バックテストは数年、運用は開始してから数週間〜数ヶ月）。
LIVE_START = date(2024, 3, 1)
LIVE_DAYS = 24


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


def _strategy_definition(
    strategy_id: str,
    name: str,
    params: dict[str, object],
    *,
    target_symbols: list[str] | None = None,
    timeframe: str = "1d",
) -> dict[str, object]:
    return {
        "strategy_id": strategy_id,
        "name": name,
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": timeframe,
        "tags": ["e2e-fixture"],
        "target_symbols": ["SPY"] if target_symbols is None else target_symbols,
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
    """Grid/Optuna 形式のトライアル列（OptimizeScreen の感度散布図用）。

    optimize ルーター ``_parse_trial`` はフラットな dict を期待する:
    - ``_METRIC_KEYS`` 外の数値キー → パラメータ軸（fast_period / slow_period）
    - ``_METRIC_KEYS`` 内の数値キー → メトリクス（sharpe_ratio / total_return_pct）

    metric は ``best_metric_name`` (=sharpe_ratio) を持たせ、fast_period≈12 を頂点と
    する擬似感度カーブ＋ノイズで変化させて、合否（sharpe>0）が混在する見栄えのする
    散布図になるようにする。
    """
    rng = random.Random(seed)  # noqa: S311
    out: list[dict[str, object]] = []
    for _ in range(n):
        fast = rng.randint(5, 20)
        slow = rng.randint(25, 60)
        sharpe = round(1.6 - abs(fast - 12) * 0.18 + rng.uniform(-0.7, 0.7), 4)
        out.append(
            {
                "fast_period": fast,
                "slow_period": slow,
                "sharpe_ratio": sharpe,
                "total_return_pct": round(sharpe * rng.uniform(7.0, 12.0), 4),
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


# ロールアップ検証用（issue: ブラウズ画面のレシピ・ロールアップ SP1）。
# 名前・銘柄・実行有無の組み合わせで、レシピの畳み方を画面で確認できるようにする。
ROLLUP_STRATEGIES: tuple[tuple[str, str, dict[str, object], list[str] | None], ...] = (
    # 同名 3 試行 = 1 レシピ（v1 / v2 は実行済み・v3 は未実行）
    ("ema_trend_v1", "EMA Trend Following", {"fast": 10, "slow": 30}, None),
    ("ema_trend_v2", "EMA Trend Following", {"fast": 12, "slow": 26}, None),
    ("ema_trend_v3", "EMA Trend Following", {"fast": 8, "slow": 40}, None),
    # 全 variant 未実行 = 既定で非表示になるレシピ
    ("idle_recipe_v1", "Idle Recipe", {"lookback": 5}, ["QQQ"]),
    ("idle_recipe_v2", "Idle Recipe", {"lookback": 9}, ["QQQ"]),
    # 同名・別銘柄 = 別レシピ（name だけを鍵にすると 1 行に潰れる）
    ("dual_symbol_spy", "Dual Symbol Recipe", {"n": 1}, ["SPY"]),
    ("dual_symbol_qqq", "Dual Symbol Recipe", {"n": 1}, ["QQQ"]),
    # 銘柄がどこからも判明しない = 「未割当」表示
    ("no_symbol_v1", "No Symbol Recipe", {"n": 1}, []),
)


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

    for sid, name, params, targets in ROLLUP_STRATEGIES:
        payload = _strategy_definition(sid, name, params, target_symbols=targets)
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
    symbol: str = "SPY",
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
        "symbol": symbol,
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
    trials = _opt_trials(seed=42, n=30)
    best = max(trials, key=lambda t: float(t["sharpe_ratio"]))
    best_params = {"fast_period": best["fast_period"], "slow_period": best["slow_period"]}
    return {
        "run_id": f"opt_{strategy_id}_001",
        "strategy_id": strategy_id,
        "symbol": "SPY",
        "run_at": run_at,
        "n_trials": len(trials),
        "best_metric_name": "sharpe_ratio",
        "best_metric_value": float(best["sharpe_ratio"]),
        "best_params_json": json.dumps(best_params, ensure_ascii=False, sort_keys=True),
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


def _live_series(*, drift: float, volatility: float, seed: int) -> list[tuple[str, float]]:
    """live 期間の equity 系列を決定論的に作る（先頭 = INITIAL_EQUITY）。

    3 系列（Live / 指数 B&H / BT combine）はいずれも live 開始時点を
    ``initial_capital`` に正規化した状態で保存されるので、fixture でも先頭を揃える。
    """
    rng = random.Random(seed)  # noqa: S311 — テストデータ生成用、暗号用途ではない
    value = INITIAL_EQUITY
    out: list[tuple[str, float]] = []
    for d in _business_dates(LIVE_START, LIVE_DAYS):
        out.append((f"{d.isoformat()}T00:00:00+00:00", round(value, 2)))
        value *= 1.0 + drift + rng.gauss(0.0, volatility)
    return out


def _live_metrics(series: list[tuple[str, float]]) -> dict[str, float]:
    """equity 系列から Live 指標カードの 5 値を導出する。

    手打ちしないのは、KPI 行（equity 系列の先頭・最終値から算出）と指標カード
    （``metrics_json``）が同じ系列を出所とするため。手打ちすると「累計損益
    +2,111.8」の隣に「トータルリターン -0.550%」が並ぶような、実データでは
    起こらない矛盾がスクリーンショットに写る（初回撮影で実際に発生した）。
    """
    values = [v for _, v in series]
    total_return_pct = (values[-1] - values[0]) / values[0] * 100.0
    daily = [(values[i] - values[i - 1]) / values[i - 1] for i in range(1, len(values))]
    mean = sum(daily) / len(daily)
    variance = sum((r - mean) ** 2 for r in daily) / len(daily)
    std = math.sqrt(variance) if variance > 0 else 1e-9
    peak = values[0]
    max_dd = 0.0
    for v in values:
        peak = max(peak, v)
        max_dd = min(max_dd, (v - peak) / peak * 100.0)
    return {
        "total_return_pct": round(total_return_pct, 4),
        "cagr_pct": round(((values[-1] / values[0]) ** (252.0 / len(values)) - 1.0) * 100.0, 4),
        "sharpe_ratio": round((mean / std) * math.sqrt(252), 4),
        "max_drawdown_pct": round(max_dd, 4),
        "volatility_pct": round(std * math.sqrt(252) * 100.0, 4),
    }


def _build_live_position_row() -> dict[str, object]:
    """Live ページ（position ベース combine portfolio）用の 1 行。

    Live 画面が「投資家が最初に知りたいこと」に答えられているかは、数字が実際に
    入った状態でしか確認できない。ベンチマーク・BT の比較 2 系列と、現金比率が
    読める建玉スナップショットを入れる。

    建玉の 1 つは **取得単価が解決できず含み損益が null** のケースにしている。
    テーブルはここを `—` で描く仕様で、桁数の異なる実数と `—` が混在したときの
    レイアウトも撮影・回帰の対象に含めるため。

    金額は手打ちせず equity 系列の最終値から導出する。KPI の「現在評価額」は
    equity 最終値を、建玉テーブルの「合計」は ``total_value`` を使うため、
    手打ちすると両者が食い違う。
    """
    live = _live_series(drift=-0.0001, volatility=0.006, seed=21)
    benchmark = _live_series(drift=-0.0016, volatility=0.009, seed=22)
    backtest = _live_series(drift=-0.0019, volatility=0.008, seed=23)

    # total_value は equity 最終値と一致させる（KPI とテーブルの整合）。
    total_value = float(live[-1][1])

    # (ticker, qty, avg_cost, last_price)。avg_cost=None は取得単価が解決できず
    # 含み損益が null で届く建玉。
    holdings: list[tuple[str, float, float | None, float]] = [
        ("US.TQQQ", 120.0, 62.35, 60.18),
        ("US.GLD", 18.0, 241.9, 248.05),
        ("US.TLT", 5.0, None, 86.42),
    ]
    positions: list[dict[str, object]] = []
    for ticker, qty, avg_cost, last_price in holdings:
        mv = round(qty * last_price, 2)
        positions.append(
            {
                "ticker": ticker,
                "qty": qty,
                # 取得単価不明でも avg_cost は 0.0 で届く（alpha-forge PR #1334）。
                # 「不明」は損益側が None であることで区別される。
                "avg_cost": 0.0 if avg_cost is None else avg_cost,
                "last_price": last_price,
                "market_value": mv,
                "weight_pct": round(mv / total_value * 100.0, 2),
                "unrealized_pnl": (
                    None if avg_cost is None else round(qty * (last_price - avg_cost), 2)
                ),
                "unrealized_pnl_pct": (
                    None
                    if avg_cost is None
                    else round((last_price - avg_cost) / avg_cost * 100.0, 2)
                ),
            }
        )
    market_value = round(sum(float(p["market_value"]) for p in positions), 2)
    return {
        "portfolio_id": "beat_index_hedged",
        "metrics_json": json.dumps(_live_metrics(live), ensure_ascii=False),
        "backtest_metrics_json": json.dumps(_live_metrics(backtest), ensure_ascii=False),
        "equity_json": json.dumps(live, ensure_ascii=False),
        "benchmark_equity_json": json.dumps(benchmark, ensure_ascii=False),
        "backtest_equity_json": json.dumps(backtest, ensure_ascii=False),
        "positions_json": json.dumps(positions, ensure_ascii=False),
        "cash": round(total_value - market_value, 2),
        "total_value": total_value,
        "receipts_count": 22,
        "sub_strategies_json": json.dumps(["tqqq_v1", "gld_v1", "tlt_v1"], ensure_ascii=False),
        "updated_at": "2024-04-03T22:35:00+00:00",
    }


def _write_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    engine = create_engine(f"sqlite:///{DB_PATH}", future=True)
    metadata.create_all(
        engine, tables=[backtest_results, optimization_runs, live_position_summaries]
    )
    rows = [
        _build_backtest_row("sma_cross", seed=1, drift=0.0008, volatility=0.012, run_at="2024-04-01T10:00:00"),
        _build_backtest_row("rsi_reversal", seed=2, drift=0.0006, volatility=0.014, run_at="2024-04-02T10:00:00"),
        _build_backtest_row("momo_breakout", seed=3, drift=0.0010, volatility=0.018, run_at="2024-04-03T10:00:00"),
        # 同名 3 試行のうち 2 件だけ実行済み。drift を変えて v2 が best になるようにする
        _build_backtest_row("ema_trend_v1", seed=4, drift=0.0005, volatility=0.013, run_at="2024-04-04T10:00:00"),
        _build_backtest_row("ema_trend_v2", seed=5, drift=0.0014, volatility=0.013, run_at="2024-04-05T10:00:00"),
        # 同名・別銘柄。symbol を変えて別レシピになることを画面で確認する
        _build_backtest_row("dual_symbol_spy", seed=6, drift=0.0007, volatility=0.015, run_at="2024-04-06T10:00:00", symbol="SPY"),
        _build_backtest_row("dual_symbol_qqq", seed=7, drift=0.0009, volatility=0.015, run_at="2024-04-07T10:00:00", symbol="QQQ"),
    ]
    opt_rows = [
        _build_optimization_row("rsi_reversal", "2024-04-02T11:00:00"),
        _build_wfo_optimization_row("sma_cross", "2024-04-01T11:00:00"),
    ]
    with engine.begin() as conn:
        conn.execute(insert(backtest_results), rows)
        conn.execute(insert(optimization_runs), opt_rows)
        conn.execute(insert(live_position_summaries), [_build_live_position_row()])


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
