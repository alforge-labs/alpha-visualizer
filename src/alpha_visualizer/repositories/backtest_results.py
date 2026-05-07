"""バックテスト結果 Repository。

`forge.db` の `backtest_results` テーブルに対する読み取り操作を集約する。
Router 層は本クラスを ``Depends`` で受け取り、HTTP 変換のみを担当する。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from sqlalchemy import Engine, func, select

from alpha_visualizer.db import backtest_results

_ALL_COLUMNS: Final = (
    backtest_results.c.run_id,
    backtest_results.c.strategy_id,
    backtest_results.c.symbol,
    backtest_results.c.run_at,
    backtest_results.c.total_return_pct,
    backtest_results.c.cagr_pct,
    backtest_results.c.sharpe_ratio,
    backtest_results.c.sortino_ratio,
    backtest_results.c.calmar_ratio,
    backtest_results.c.max_drawdown_pct,
    backtest_results.c.total_trades,
    backtest_results.c.win_rate_pct,
    backtest_results.c.profit_factor,
    backtest_results.c.avg_holding_days,
    backtest_results.c.metrics_json,
    backtest_results.c.equity_curve_json,
    backtest_results.c.buy_hold_curve_json,
    backtest_results.c.trades_json,
    backtest_results.c.oos_start,
)


@dataclass(frozen=True)
class BacktestResultRow:
    """``backtest_results`` の 1 行を表す不変 DTO。"""

    run_id: str
    strategy_id: str | None
    symbol: str | None
    run_at: str | None
    total_return_pct: float | None
    cagr_pct: float | None
    sharpe_ratio: float | None
    sortino_ratio: float | None
    calmar_ratio: float | None
    max_drawdown_pct: float | None
    total_trades: int | None
    win_rate_pct: float | None
    profit_factor: float | None
    avg_holding_days: float | None
    metrics_json: str | None
    equity_curve_json: str | None
    buy_hold_curve_json: str | None
    trades_json: str | None
    oos_start: str | None


class BacktestResultsRepository:
    """``backtest_results`` テーブルへの読み取り専用アクセサ。"""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def list_results(
        self,
        *,
        strategy_id: str | None = None,
        symbol: str | None = None,
    ) -> list[BacktestResultRow]:
        """条件に一致する結果を ``run_at`` 降順で返す。"""
        stmt = select(*_ALL_COLUMNS)
        if strategy_id is not None:
            stmt = stmt.where(backtest_results.c.strategy_id == strategy_id)
        if symbol is not None:
            stmt = stmt.where(backtest_results.c.symbol == symbol)
        stmt = stmt.order_by(backtest_results.c.run_at.desc())

        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [BacktestResultRow(**row._mapping) for row in rows]

    def get_result(self, run_id: str) -> BacktestResultRow | None:
        """``run_id`` に一致する結果を返す。存在しなければ ``None``。"""
        stmt = select(*_ALL_COLUMNS).where(backtest_results.c.run_id == run_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        return BacktestResultRow(**row._mapping) if row is not None else None

    def find_latest_run_id(self, *, strategy_id: str, symbol: str) -> str | None:
        """指定戦略・銘柄の最新 run_id を返す。`run.py` のサブプロセス実行後に使う。"""
        stmt = (
            select(backtest_results.c.run_id)
            .where(backtest_results.c.strategy_id == strategy_id)
            .where(backtest_results.c.symbol == symbol)
            .order_by(backtest_results.c.run_at.desc())
            .limit(1)
        )
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        return row.run_id if row else None

    def find_latest_by_strategy_ids(
        self, strategy_ids: list[str]
    ) -> dict[str, BacktestResultRow]:
        """各 ``strategy_id`` の最新（``run_at`` 降順 1 行）を 1 クエリで取得して dict で返す。

        SQLite Window 関数 (``ROW_NUMBER() OVER (PARTITION BY strategy_id
        ORDER BY run_at DESC)``) で N+1 を回避する。

        :param strategy_ids: 対象 ``strategy_id`` のリスト。空リストなら
            クエリを発行せず空 dict を返す。
        :returns: ``{strategy_id: BacktestResultRow}``。該当行がない
            ``strategy_id`` はキーに含まれない。
        """
        if not strategy_ids:
            return {}

        rn = (
            func.row_number()
            .over(
                partition_by=backtest_results.c.strategy_id,
                order_by=backtest_results.c.run_at.desc(),
            )
            .label("rn")
        )
        subq = (
            select(*_ALL_COLUMNS, rn)
            .where(backtest_results.c.strategy_id.in_(strategy_ids))
            .subquery()
        )
        # ``rn`` 列を除外して全カラムを射影する
        projected = [getattr(subq.c, col.name) for col in _ALL_COLUMNS]
        stmt = select(*projected).where(subq.c.rn == 1)

        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return {
            row.strategy_id: BacktestResultRow(**row._mapping) for row in rows
        }
