"""最適化結果 Repository。

`forge.db` の ``optimization_runs`` テーブルに対する読み取り操作を集約する。
WFO ルーターからの利用に必要な ``backtest_results`` の OOS エクイティカーブ
取得もまとめて提供する（router 層から SQL を完全に追い出すため）。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from sqlalchemy import Engine, select

from alpha_visualizer.db import backtest_results, optimization_runs

_OPTIMIZATION_COLUMNS: Final = (
    optimization_runs.c.run_id,
    optimization_runs.c.strategy_id,
    optimization_runs.c.symbol,
    optimization_runs.c.run_at,
    optimization_runs.c.n_trials,
    optimization_runs.c.best_metric_name,
    optimization_runs.c.best_metric_value,
    optimization_runs.c.best_params_json,
    optimization_runs.c.duration_seconds,
    optimization_runs.c.all_trials_json,
)


@dataclass(frozen=True)
class OptimizationRunRow:
    """``optimization_runs`` の 1 行を表す不変 DTO。"""

    run_id: str
    strategy_id: str | None
    symbol: str | None
    run_at: str | None
    n_trials: int | None
    best_metric_name: str | None
    best_metric_value: float | None
    best_params_json: str | None
    duration_seconds: float | None
    all_trials_json: str | None


class OptimizationRepository:
    """``optimization_runs`` テーブル + WFO 関連の読み取り専用アクセサ。

    ``backtest_results`` への OOS エクイティカーブ取得は WFO ルーター固有の
    ユースケースのため、本 Repository に集約する（読み取り専用かつ
    `(strategy_id, oos_start)` での 1 行取得に限定）。
    """

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def get_latest_for_strategy(self, strategy_id: str) -> OptimizationRunRow | None:
        """``strategy_id`` の最新（``run_at`` 降順 1 件）を返す。"""
        stmt = (
            select(*_OPTIMIZATION_COLUMNS)
            .where(optimization_runs.c.strategy_id == strategy_id)
            .order_by(optimization_runs.c.run_at.desc())
            .limit(1)
        )
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        return OptimizationRunRow(**row._mapping) if row is not None else None

    def list_runs_for_strategy(self, strategy_id: str) -> list[OptimizationRunRow]:
        """``strategy_id`` のラン一覧を ``run_at`` 降順で返す。

        WFO ルーターは「最新ランから順に走査し、最初に WFO 形式の
        ``all_trials_json`` を持つラン」を採用するため、複数行の取得手段が必要。
        """
        stmt = (
            select(*_OPTIMIZATION_COLUMNS)
            .where(optimization_runs.c.strategy_id == strategy_id)
            .order_by(optimization_runs.c.run_at.desc())
        )
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [OptimizationRunRow(**r._mapping) for r in rows]

    def find_oos_equity_curve_json(
        self, strategy_id: str, oos_start: str
    ) -> str | None:
        """``backtest_results`` から ``(strategy_id, oos_start)`` に該当する
        最新ランの ``equity_curve_json`` を返す。

        WFO の composite curve 構築フォールバックのために使う。
        """
        stmt = (
            select(backtest_results.c.equity_curve_json)
            .where(backtest_results.c.strategy_id == strategy_id)
            .where(backtest_results.c.oos_start == oos_start)
            .order_by(backtest_results.c.run_at.desc())
            .limit(1)
        )
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        if row is None:
            return None
        return row.equity_curve_json
