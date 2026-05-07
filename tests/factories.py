"""テストフィクスチャ用 factory 関数群。

Test Data Builder / Object Mother パターンで seed 操作を集約。
主要 3 テーブル (backtest_results / optimization_runs / strategies) の
スキーマは ``alpha_visualizer.db.metadata`` から派生（Single Source of Truth）。
補助テーブル (wfo_windows / oos_equity_curves / live_*) は db.py 未登録の
ため raw SQL でセットアップする（次回以降の PR で db.py に登録予定）。

INSERT 操作は簡潔さを優先して ``sqlite3`` の raw SQL のままにしている。
"""

from __future__ import annotations

import datetime
import json
import pathlib
import sqlite3

from sqlalchemy import create_engine

from alpha_visualizer.db import (
    backtest_results,
    metadata,
    optimization_runs,
    strategies,
)


def _create_schema(db_path: pathlib.Path) -> None:
    """``backtest_results`` / ``optimization_runs`` / ``strategies`` のスキーマを生成。

    db.py の SQLAlchemy MetaData を Single Source of Truth として、
    重複した CREATE TABLE 文をテスト側で書かないようにする。
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        metadata.create_all(
            engine,
            tables=[backtest_results, optimization_runs, strategies],
        )
    finally:
        engine.dispose()


def build_backtest_db(db_path: pathlib.Path) -> None:
    """alpha-forge と互換のスキーマで最小の backtest_results.db を作る。"""
    _create_schema(db_path)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO backtest_results (
                run_id, strategy_id, symbol, run_at,
                total_return_pct, sharpe_ratio, max_drawdown_pct, total_trades,
                profit_factor, win_rate_pct,
                metrics_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "run_aapl_001",
                "ema_cross_aapl",
                "AAPL",
                "2026-04-01T12:00:00",
                12.5,
                1.42,
                -8.3,
                42,
                1.86,
                63.2,
                "{}",
            ),
        )
        conn.commit()
    finally:
        conn.close()


def seed_wfo_windows(
    db_path: pathlib.Path, strategy_id: str = "wfo_strategy"
) -> None:
    """optimization_runs に WFO ウィンドウ形式の all_trials_json を挿入する。"""
    conn = sqlite3.connect(db_path)
    windows = [
        {
            "window_id": 1,
            "label": "W1",
            "is_start": "2021-01-04",
            "is_end": "2021-06-30",
            "oos_start": "2021-07-01",
            "oos_end": "2021-12-31",
            "is_sharpe": 1.2,
            "oos_sharpe": 0.9,
            "is_return_pct": 12.0,
            "oos_return_pct": 8.0,
            "pass": True,
        },
        {
            "window_id": 2,
            "label": "W2",
            "is_start": "2022-01-03",
            "is_end": "2022-06-30",
            "oos_start": "2022-07-01",
            "oos_end": "2022-12-30",
            "is_sharpe": 1.1,
            "oos_sharpe": 0.7,
            "is_return_pct": 10.0,
            "oos_return_pct": 5.0,
            "pass": True,
        },
    ]
    conn.execute(
        """INSERT INTO optimization_runs
           (run_id, strategy_id, symbol, run_at, n_trials,
            best_metric_name, best_metric_value, best_params_json, all_trials_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "opt_wfo_001",
            strategy_id,
            "AAPL",
            "2026-01-01T00:00:00",
            50,
            "sharpe_ratio",
            0.9,
            "{}",
            json.dumps(windows),
        ),
    )
    conn.commit()
    conn.close()


def seed_oos_equity_curves(
    db_path: pathlib.Path, strategy_id: str = "wfo_strategy"
) -> None:
    """backtest_results に OOS 期間付きエクイティカーブを挿入する（各 WFO ウィンドウ対応）。"""

    def _make_curve(
        start_date: str, n_days: int, start_val: float, return_pct: float
    ) -> str:
        base = datetime.date.fromisoformat(start_date)
        end_val = start_val * (1 + return_pct / 100)
        curve = []
        for i in range(n_days):
            d = base + datetime.timedelta(days=i)
            v = start_val + (end_val - start_val) * (i / max(n_days - 1, 1))
            curve.append({"date": d.isoformat(), "value": round(v, 4)})
        return json.dumps(curve)

    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO backtest_results
           (run_id, strategy_id, symbol, run_at, metrics_json, equity_curve_json, oos_start)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            "bt_wfo_w1",
            strategy_id,
            "AAPL",
            "2026-01-01T00:00:00",
            "{}",
            _make_curve("2021-07-01", 184, 100000.0, 8.0),
            "2021-07-01",
        ),
    )
    conn.execute(
        """INSERT INTO backtest_results
           (run_id, strategy_id, symbol, run_at, metrics_json, equity_curve_json, oos_start)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            "bt_wfo_w2",
            strategy_id,
            "AAPL",
            "2026-01-01T00:00:01",
            "{}",
            _make_curve("2022-07-01", 183, 100000.0, 5.0),
            "2022-07-01",
        ),
    )
    conn.commit()
    conn.close()


def build_strategies_db(
    db_path: pathlib.Path, strategy_id: str, name: str
) -> None:
    """alpha-forge と互換のスキーマで最小の strategies.db を作る。"""
    _create_schema(db_path)
    conn = sqlite3.connect(db_path)
    try:
        definition = json.dumps(
            {
                "strategy_id": strategy_id,
                "name": name,
                "parameters": {"fast": 12, "slow": 26},
            }
        )
        conn.execute(
            """
            INSERT INTO strategies (
                strategy_id, name, version, asset_type, timeframe,
                tags, notes, definition_json,
                created_at, updated_at
            ) VALUES (?, ?, '1.0.0', 'stock', '1d', '[]', '', ?, '2026-04-01', '2026-04-01')
            """,
            (strategy_id, name, definition),
        )
        conn.commit()
    finally:
        conn.close()


def insert_regime_run(
    db_path: pathlib.Path,
    *,
    run_id: str,
    metrics_json: str,
    equity_curve_json: str,
) -> None:
    """regime_series / regime_breakdown を含む metrics_json で 1 行 insert。"""
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at,"
            " total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,"
            " profit_factor, total_trades,"
            " metrics_json, equity_curve_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                "regime_strategy",
                "AAPL",
                "2026-01-01T00:00:00",
                2.5,
                1.1,
                -3.0,
                55.0,
                1.4,
                5,
                metrics_json,
                equity_curve_json,
            ),
        )


def build_optimize_db(
    db_path: pathlib.Path,
    strategy_id: str,
    trials_json: list[dict] | None,
    best_metric_name: str = "sharpe_ratio",
    best_metric_value: float = 1.5,
) -> None:
    """optimization_runs テーブルを持つ最小 DB を作成してトライアルデータを挿入する。"""
    _create_schema(db_path)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """INSERT INTO optimization_runs
               (run_id, strategy_id, symbol, run_at, n_trials,
                best_metric_name, best_metric_value, best_params_json, all_trials_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "opt_grid_001",
                strategy_id,
                "AAPL",
                "2026-01-01T00:00:00",
                len(trials_json) if trials_json else 0,
                best_metric_name,
                best_metric_value,
                "{}",
                json.dumps(trials_json) if trials_json is not None else None,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def seed_live_summary(
    live_dir: pathlib.Path,
    strategy_id: str,
    payload: dict,
) -> None:
    """<live_dir>/summaries/<strategy_id>.live.summary.json を作成する。"""
    summaries_dir = live_dir / "summaries"
    summaries_dir.mkdir(parents=True, exist_ok=True)
    (summaries_dir / f"{strategy_id}.live.summary.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )


def seed_live_trades(
    live_dir: pathlib.Path,
    strategy_id: str,
    trades: list[dict],
) -> None:
    """<live_dir>/trades/<strategy_id>.trades.json を作成する。"""
    trades_dir = live_dir / "trades"
    trades_dir.mkdir(parents=True, exist_ok=True)
    (trades_dir / f"{strategy_id}.trades.json").write_text(
        json.dumps(trades), encoding="utf-8"
    )


def seed_backtest_with_trades(
    db_path: pathlib.Path,
    *,
    run_id: str,
    strategy_id: str,
    run_at: str,
    trades: list[dict],
) -> None:
    """forge.db に backtest_results を 1 件 insert（trades_json 込み）。"""
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO backtest_results"
            " (run_id, strategy_id, symbol, run_at,"
            " total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,"
            " profit_factor, total_trades, metrics_json, trades_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                strategy_id,
                "AAPL",
                run_at,
                10.0,
                1.5,
                -5.0,
                60.0,
                1.8,
                len(trades),
                "{}",
                json.dumps(trades),
            ),
        )
