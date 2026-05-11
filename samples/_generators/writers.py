"""サンプルデータを ``sample-forge/`` ディレクトリに書き出すライター群。

各書き出しはディレクトリ作成 → ファイル生成 → サイズ／件数検証の順で実行する。
SQLite 書き込みは ``run_id`` 昇順で挿入することでバイト等価な再生成を担保し、
``samples/build_samples.py`` の CI 決定論性チェックが ``git diff --exit-code`` で
0 終了することを目指す。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, insert

from alpha_visualizer.db import backtest_results, metadata, optimization_runs
from samples._generators.pseudo_backtest import BacktestRun
from samples._generators.pseudo_grid import GridRun
from samples._generators.pseudo_wfo import WFORun

SAMPLE_FORGE_DIR_NAME: str = "sample-forge"
"""``samples/`` 直下のターゲットディレクトリ名。"""

DEFAULT_DB_BUDGET_BYTES: int = 8_000_000
"""SQLite DB のサイズ予算（リポジトリ同梱許容ライン）。"""


def write_strategies(
    strategies: dict[str, dict[str, Any]],
    strategies_dir: Path,
) -> None:
    """``data/strategies/*.json`` を 1 戦略 1 ファイルで書き出す。"""
    strategies_dir.mkdir(parents=True, exist_ok=True)
    # 既存の戦略 JSON を消してから書き直す（戦略削減時の取り残し防止）。
    for old in strategies_dir.glob("*.json"):
        old.unlink()
    for sid, definition in strategies.items():
        path = strategies_dir / f"{sid}.json"
        path.write_text(
            json.dumps(definition, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def write_ideas(
    ideas: list[dict[str, Any]],
    ideas_path: Path,
) -> None:
    """``data/ideas/ideas.json`` を書き出す。"""
    ideas_path.parent.mkdir(parents=True, exist_ok=True)
    ideas_path.write_text(
        json.dumps(ideas, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _bt_row(run: BacktestRun) -> dict[str, Any]:
    metrics = run.metrics
    return {
        "run_id": run.run_id,
        "strategy_id": run.strategy_id,
        "symbol": run.symbol,
        "run_at": run.run_at,
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
        "equity_curve_json": json.dumps(run.equity_curve, ensure_ascii=False),
        "buy_hold_curve_json": json.dumps(run.buy_hold_curve, ensure_ascii=False),
        "trades_json": json.dumps(run.trades, ensure_ascii=False),
        "oos_start": run.oos_start,
    }


def _opt_row(run: WFORun | GridRun) -> dict[str, Any]:
    return {
        "run_id": run.run_id,
        "strategy_id": run.strategy_id,
        "symbol": run.symbol,
        "run_at": run.run_at,
        "n_trials": int(run.n_trials),
        "best_metric_name": run.best_metric_name,
        "best_metric_value": float(run.best_metric_value),
        "best_params_json": json.dumps(
            run.best_params, ensure_ascii=False, sort_keys=True
        ),
        "duration_seconds": float(run.duration_seconds),
        "all_trials_json": json.dumps(run.all_trials, ensure_ascii=False),
    }


def write_database(
    bt_runs: list[BacktestRun],
    wfo_runs: list[WFORun],
    grid_runs: list[GridRun],
    db_path: Path,
) -> None:
    """``backtest_results.db`` を作成し、各テーブルへ run を挿入する。

    ``run_id`` 昇順で書き込むため再実行時にバイト等価な DB が得られる。
    """
    if db_path.exists():
        db_path.unlink()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    metadata.create_all(engine, tables=[backtest_results, optimization_runs])
    bt_rows = [_bt_row(r) for r in sorted(bt_runs, key=lambda r: r.run_id)]
    opt_rows: list[dict[str, Any]] = []
    for run in sorted(wfo_runs, key=lambda r: r.run_id):
        opt_rows.append(_opt_row(run))
    for run in sorted(grid_runs, key=lambda r: r.run_id):
        opt_rows.append(_opt_row(run))
    with engine.begin() as conn:
        if bt_rows:
            conn.execute(insert(backtest_results), bt_rows)
        if opt_rows:
            conn.execute(insert(optimization_runs), opt_rows)
    engine.dispose()


def assert_size_budget(
    db_path: Path,
    max_bytes: int = DEFAULT_DB_BUDGET_BYTES,
) -> int:
    """DB ファイルのサイズが予算内に収まっていることを保証する。

    Returns:
        実サイズ（bytes）。

    Raises:
        AssertionError: 予算を超過した場合。
    """
    size = db_path.stat().st_size
    if size > max_bytes:
        raise AssertionError(
            f"DB size {size:,} bytes exceeds budget {max_bytes:,} bytes; "
            f"shrink the fixture (e.g. weekly-sample equity curves)."
        )
    return size


def write_forge_dir(
    forge_dir: Path,
    strategies: dict[str, dict[str, Any]],
    ideas: list[dict[str, Any]],
    bt_runs: list[BacktestRun],
    wfo_runs: list[WFORun],
    grid_runs: list[GridRun],
) -> dict[str, int]:
    """サンプル ``forge_dir`` を組み立て、件数とサイズを返す。

    Args:
        forge_dir: ``sample-forge/`` ディレクトリ（``forge.yaml`` と ``data/`` の親）。
        strategies: ``strategy_id → 戦略 dict`` の辞書。
        ideas: ``ideas.json`` に書き込むアイデア配列。
        bt_runs: バックテストランのリスト。
        wfo_runs: WFO 最適化ランのリスト。
        grid_runs: Grid 最適化ランのリスト。

    Returns:
        ``{"strategies": ..., "ideas": ..., "backtest_runs": ..., ...}`` の集計。
    """
    forge_dir = Path(forge_dir)
    strategies_dir = forge_dir / "data" / "strategies"
    ideas_path = forge_dir / "data" / "ideas" / "ideas.json"
    db_path = forge_dir / "data" / "results" / "backtest_results.db"
    write_strategies(strategies, strategies_dir)
    write_ideas(ideas, ideas_path)
    write_database(bt_runs, wfo_runs, grid_runs, db_path)
    db_size = assert_size_budget(db_path)
    return {
        "strategies": len(strategies),
        "ideas": len(ideas),
        "backtest_runs": len(bt_runs),
        "optimization_runs": len(wfo_runs) + len(grid_runs),
        "db_size_bytes": db_size,
    }
