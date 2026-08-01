"""バックテスト結果 Repository。

`backtest_results.db` の `backtest_results` テーブルに対する読み取り操作を集約する。
Router 層は本クラスを ``Depends`` で受け取り、HTTP 変換のみを担当する。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Final

from sqlalchemy import Engine, func, inspect, select
from sqlalchemy.exc import NoSuchTableError, OperationalError

from alpha_visualizer.db import backtest_results

logger = logging.getLogger(__name__)

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

# forge 側の ALTER TABLE で後付けされる列（旧 forge が書いた DB には存在しない。
# DTO のフィールド名と一致させること — 実在する列のみ SELECT に含める）
_OPTIONAL_COLUMNS: Final = ("source", "carry_adjusted_json", "params_json")

# 一覧系（/api/results・/api/strategies）で使うスカラー列のみ。
# metrics_json / equity_curve_json 等の blob 列を含めない (issue #384):
# サマリはスカラー値しか使わないのに、数百 run 分のエクイティカーブを
# 読み込んだ直後に捨てるのは run 蓄積に対して線形に悪化するため。
_SUMMARY_COLUMNS: Final = (
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
    backtest_results.c.oos_start,
)

# _OPTIONAL_COLUMNS のうちサマリでも使う列（carry_adjusted_json は blob なので除外）
_SUMMARY_OPTIONAL_COLUMNS: Final = ("source",)


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
    # 実行元 provenance（vis#299）。列が無い旧 DB では常に None
    source: str | None = None
    # FX キャリー近似の {"metrics", "note"} JSON（vis#308）。列が無い DB では常に None
    carry_adjusted_json: str | None = None
    params_json: str | None = None


@dataclass(frozen=True)
class BacktestResultSummaryRow:
    """一覧系 API 用のスカラーのみの不変 DTO（blob 列を持たない, issue #384）。"""

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
    oos_start: str | None
    # 実行元 provenance（vis#299）。列が無い旧 DB では常に None
    source: str | None = None


class BacktestResultsRepository:
    """``backtest_results`` テーブルへの読み取り専用アクセサ。"""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._existing_optional_names_cache: frozenset[str] | None = None

    def _existing_optional_names(self) -> frozenset[str]:
        """``_OPTIONAL_COLUMNS`` のうち DB に実在する列名を返す。

        後付け列は forge 側の ALTER TABLE（書き込み時）で追加されるため、
        旧 forge が書いた DB には一部または全部が存在しない。
        visualizer は読み取り専用で ALTER しない（single-writer 原則）ので、
        列の有無を検出して SELECT を組み替える。無い列の DTO フィールドは
        既定値 None になる。

        検出結果はインスタンス内キャッシュ（= Depends によりリクエスト単位）。
        forge が ALTER した直後もサーバー再起動なしで次リクエストから追従できる。
        テーブル未作成・旧スキーマ由来の失敗のみ「列なし」へフォールバックし、
        それ以外の例外は握り潰さず送出する（Fail Loud）。
        """
        if self._existing_optional_names_cache is None:
            try:
                names = {
                    c["name"]
                    for c in inspect(self._engine).get_columns("backtest_results")
                }
            except (NoSuchTableError, OperationalError) as exc:
                logger.debug("後付け列の検出に失敗（旧 DB 相当として扱う）: %s", exc)
                names = set()
            self._existing_optional_names_cache = frozenset(
                name for name in _OPTIONAL_COLUMNS if name in names
            )
        return self._existing_optional_names_cache

    def _select_columns(self) -> tuple[Any, ...]:
        """詳細取得用の SELECT 対象カラム（後付け列は実在するときのみ含める）。"""
        existing = self._existing_optional_names()
        return (
            *_ALL_COLUMNS,
            *(
                getattr(backtest_results.c, name)
                for name in _OPTIONAL_COLUMNS
                if name in existing
            ),
        )

    def _summary_select_columns(self) -> tuple[Any, ...]:
        """一覧用の SELECT 対象カラム（スカラーのみ・blob 列を含めない）。"""
        existing = self._existing_optional_names()
        return (
            *_SUMMARY_COLUMNS,
            *(
                getattr(backtest_results.c, name)
                for name in _SUMMARY_OPTIONAL_COLUMNS
                if name in existing
            ),
        )

    def list_results(
        self,
        *,
        strategy_id: str | None = None,
        symbol: str | None = None,
        limit: int | None = None,
    ) -> list[BacktestResultRow]:
        """条件に一致する結果を ``run_at`` 降順で返す。

        blob 列（equity_curve_json 等）を含む全カラムを返すため、一覧表示には
        :meth:`list_results_summary` を使うこと。``limit`` は「最新 1 件だけ
        欲しい」呼び出し元（live diff 等）が全行ロードを避けるためのもの。
        """
        stmt = select(*self._select_columns())
        if strategy_id is not None:
            stmt = stmt.where(backtest_results.c.strategy_id == strategy_id)
        if symbol is not None:
            stmt = stmt.where(backtest_results.c.symbol == symbol)
        stmt = stmt.order_by(backtest_results.c.run_at.desc())
        if limit is not None:
            stmt = stmt.limit(limit)

        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [BacktestResultRow(**row._mapping) for row in rows]

    def list_results_summary(
        self,
        *,
        strategy_id: str | None = None,
        symbol: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[BacktestResultSummaryRow]:
        """一覧用にスカラー列のみを ``run_at`` 降順で返す (issue #384)。

        ``limit`` / ``offset`` は SQL に適用され、blob 列は SELECT しない。
        """
        stmt = select(*self._summary_select_columns())
        if strategy_id is not None:
            stmt = stmt.where(backtest_results.c.strategy_id == strategy_id)
        if symbol is not None:
            stmt = stmt.where(backtest_results.c.symbol == symbol)
        stmt = stmt.order_by(backtest_results.c.run_at.desc())
        if limit is not None:
            stmt = stmt.limit(limit)
        if offset:
            stmt = stmt.offset(offset)

        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [BacktestResultSummaryRow(**row._mapping) for row in rows]

    def get_result(self, run_id: str) -> BacktestResultRow | None:
        """``run_id`` に一致する結果を返す。存在しなければ ``None``。"""
        stmt = select(*self._select_columns()).where(
            backtest_results.c.run_id == run_id
        )
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

    def _fetch_latest_rows(
        self, strategy_ids: list[str], columns: tuple[Any, ...]
    ) -> list[Any]:
        """各 ``strategy_id`` の最新（``run_at`` 降順 1 行）を 1 クエリで取得する。

        SQLite Window 関数 (``ROW_NUMBER() OVER (PARTITION BY strategy_id
        ORDER BY run_at DESC)``) で N+1 を回避する。
        """
        rn = (
            func.row_number()
            .over(
                partition_by=backtest_results.c.strategy_id,
                order_by=backtest_results.c.run_at.desc(),
            )
            .label("rn")
        )
        subq = (
            select(*columns, rn)
            .where(backtest_results.c.strategy_id.in_(strategy_ids))
            .subquery()
        )
        # ``rn`` 列を除外して全カラムを射影する
        projected = [getattr(subq.c, col.name) for col in columns]
        stmt = select(*projected).where(subq.c.rn == 1)

        with self._engine.connect() as conn:
            return list(conn.execute(stmt).all())

    def find_latest_equity(self, strategy_id: str) -> tuple[str, str | None] | None:
        """最新 run の ``(run_id, equity_curve_json)`` を返す (issue #387)。

        sparkline 用に blob 1 列だけを読む。該当 run が無ければ ``None``。
        """
        rows = self._fetch_latest_rows(
            [strategy_id],
            (
                backtest_results.c.strategy_id,
                backtest_results.c.run_id,
                backtest_results.c.equity_curve_json,
            ),
        )
        if not rows:
            return None
        return rows[0].run_id, rows[0].equity_curve_json

    def find_latest_by_strategy_ids(
        self, strategy_ids: list[str]
    ) -> dict[str, BacktestResultRow]:
        """各 ``strategy_id`` の最新行（blob 列込み）を dict で返す。

        equity 重ね描き等で blob 列が必要な compare 用。スカラーだけで足りる
        一覧には :meth:`find_latest_summary_by_strategy_ids` を使うこと。

        :param strategy_ids: 対象 ``strategy_id`` のリスト。空リストなら
            クエリを発行せず空 dict を返す。
        :returns: ``{strategy_id: BacktestResultRow}``。該当行がない
            ``strategy_id`` はキーに含まれない。
        """
        if not strategy_ids:
            return {}
        rows = self._fetch_latest_rows(strategy_ids, self._select_columns())
        return {
            row.strategy_id: BacktestResultRow(**row._mapping) for row in rows
        }

    def find_latest_summary_by_strategy_ids(
        self, strategy_ids: list[str]
    ) -> dict[str, BacktestResultSummaryRow]:
        """各 ``strategy_id`` の最新スカラー行を dict で返す (issue #384)。

        ``/api/strategies`` 一覧はスカラー値しか使わないため、blob 列を
        SELECT しないこちらを使う。
        """
        if not strategy_ids:
            return {}
        rows = self._fetch_latest_rows(strategy_ids, self._summary_select_columns())
        return {
            row.strategy_id: BacktestResultSummaryRow(**row._mapping)
            for row in rows
        }
