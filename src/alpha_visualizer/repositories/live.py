"""ライブ実績 Repository。

alpha-forge は live 実績を JSON ファイルではなく ``backtest_results.db`` 内の
SQLite テーブル群へ永続化する方式へ移行済み（issue #209）。本 Repository は
その読み取り専用アクセサで、3 種のエンティティを扱う:

- ``live_summaries``           … trade 単位の戦略別サマリ（strategy_id 粒度）
- ``live_trades``              … entry/exit trade 明細
- ``live_position_summaries``  … combine portfolio の position ベースサマリ
                                  （portfolio_id 粒度・equity 由来 metrics・trade 無し）

加えて、live と期間整合した diff 計算のため ``backtest_results`` の 1 行取得を
``BacktestResultsRepository`` に委譲する（合成）。

live テーブルは ``backtest_results`` と同一 DB（``app.state.engine``）に存在する
ため、追加の Engine 配線は不要。読み取り専用かつ tolerant に実装し、live を一度も
使っていない DB（テーブル未作成）でも 500 を出さず空として扱う。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import Engine, select
from sqlalchemy.exc import OperationalError

from alpha_visualizer.db import (
    live_position_summaries,
    live_summaries,
    live_trades,
)
from alpha_visualizer.repositories.backtest_results import (
    BacktestResultRow,
    BacktestResultsRepository,
)

logger = logging.getLogger(__name__)


def _parse_json(raw: Any, default: Any) -> Any:
    """TEXT 列に格納された JSON 文字列を安全にパースする。失敗時は ``default``。"""
    if raw is None:
        return default
    if isinstance(raw, (list, dict)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default
    return default


class LiveDataRepository:
    """ライブ実績データ（``backtest_results.db`` の live_* テーブル）の Repository。

    ``backtest_results`` へのアクセスは ``BacktestResultsRepository`` に委譲し、
    SQL アクセスを 1 箇所にまとめる。``engine`` が ``None``（backtest_results.db
    不在、issue #173）の場合は live データも空として扱う。
    """

    def __init__(
        self,
        engine: Engine | None,
        *,
        backtest_repo: BacktestResultsRepository | None = None,
    ) -> None:
        self._engine = engine
        # engine が None のときは backtest 連携も不可。fetch_backtest_for_diff は
        # その場合に呼ばれない想定（router 側で trades 有無に依存）だが、防御的に None。
        if backtest_repo is not None:
            self._backtest_repo: BacktestResultsRepository | None = backtest_repo
        elif engine is not None:
            self._backtest_repo = BacktestResultsRepository(engine)
        else:
            self._backtest_repo = None

    # ------------------------------------------------------------------
    # 内部: tolerant クエリ
    # ------------------------------------------------------------------
    def _fetch_all(self, stmt: Any) -> list[Any]:
        """SELECT を実行して全行返す。engine 不在 / テーブル未作成なら空リスト。

        live を一度も使っていない DB には live_* テーブルが無いため、その
        ``no such table`` のみ空扱いにする。DB 破損・ロック競合・ストレージ枯渇
        など他の ``OperationalError`` は握り潰さず再送出する（Fail Loud）。
        """
        if self._engine is None:
            return []
        try:
            with self._engine.connect() as conn:
                return conn.execute(stmt).all()
        except OperationalError as exc:
            if "no such table" in str(exc).lower():
                logger.debug("live テーブル未作成のため空として扱う: %s", exc)
                return []
            raise

    # ------------------------------------------------------------------
    # 一覧 / 存在チェック
    # ------------------------------------------------------------------
    def list_summary_strategy_ids(self) -> list[str]:
        """``live_summaries`` の strategy_id をソート済みで返す（trade 単位）。"""
        rows = self._fetch_all(
            select(live_summaries.c.strategy_id).order_by(live_summaries.c.strategy_id)
        )
        return [r.strategy_id for r in rows]

    def list_position_portfolio_ids(self) -> list[str]:
        """``live_position_summaries`` の portfolio_id をソート済みで返す（combine）。"""
        rows = self._fetch_all(
            select(live_position_summaries.c.portfolio_id).order_by(
                live_position_summaries.c.portfolio_id
            )
        )
        return [r.portfolio_id for r in rows]

    def has_summary(self, strategy_id: str) -> bool:
        rows = self._fetch_all(
            select(live_summaries.c.strategy_id).where(
                live_summaries.c.strategy_id == strategy_id
            )
        )
        return len(rows) > 0

    def has_trades(self, strategy_id: str) -> bool:
        rows = self._fetch_all(
            select(live_trades.c.id)
            .where(live_trades.c.strategy_id == strategy_id)
            .limit(1)
        )
        return len(rows) > 0

    def strategy_ids_with_trades(self) -> set[str]:
        """``live_trades`` に 1 件以上行を持つ strategy_id の集合を 1 クエリで返す。

        一覧 API が戦略ごとに ``has_trades`` を個別クエリする N+1 を避けるための
        まとめ取得用。
        """
        rows = self._fetch_all(select(live_trades.c.strategy_id).distinct())
        return {r.strategy_id for r in rows}

    # ------------------------------------------------------------------
    # サマリ / trade 読み取り（trade 単位）
    # ------------------------------------------------------------------
    def load_summary(self, strategy_id: str) -> dict[str, Any] | None:
        """``live_summaries`` の 1 行を辞書で返す。存在しなければ ``None``。

        ``symbols`` は TEXT(JSON) 列なので ``list[str]`` にパースして返す。
        """
        rows = self._fetch_all(
            select(live_summaries).where(
                live_summaries.c.strategy_id == strategy_id
            )
        )
        if not rows:
            return None
        out = dict(rows[0]._mapping)
        out["symbols"] = _parse_json(out.get("symbols"), [])
        return out

    def load_raw_trades(self, strategy_id: str) -> list[dict[str, Any]]:
        """``live_trades`` の該当行を ``entry_at`` 昇順の辞書リストで返す。

        正規化（``normalize_trade``）は呼び出し側に委ねる。``tags`` は list に
        パースして返す。
        """
        rows = self._fetch_all(
            select(live_trades)
            .where(live_trades.c.strategy_id == strategy_id)
            .order_by(live_trades.c.entry_at)
        )
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r._mapping)
            d["tags"] = _parse_json(d.get("tags"), [])
            out.append(d)
        return out

    # ------------------------------------------------------------------
    # position ベースサマリ（combine portfolio）
    # ------------------------------------------------------------------
    def load_position_summary(self, portfolio_id: str) -> dict[str, Any] | None:
        """``live_position_summaries`` の 1 行を辞書で返す。無ければ ``None``。

        ``metrics_json`` / ``backtest_metrics_json`` / ``equity_json`` /
        ``sub_strategies_json`` をパースして展開する。
        """
        rows = self._fetch_all(
            select(live_position_summaries).where(
                live_position_summaries.c.portfolio_id == portfolio_id
            )
        )
        if not rows:
            return None
        m = rows[0]._mapping
        return {
            "portfolio_id": m["portfolio_id"],
            "metrics": _parse_json(m["metrics_json"], {}),
            "backtest_metrics": _parse_json(m["backtest_metrics_json"], None),
            "equity": _parse_json(m["equity_json"], []),
            "receipts_count": m["receipts_count"],
            "sub_strategies": _parse_json(m["sub_strategies_json"], []),
            "updated_at": m["updated_at"],
        }

    # ------------------------------------------------------------------
    # backtest_results 連携（diff 計算用の 1 行取得）
    # ------------------------------------------------------------------
    def fetch_backtest_for_diff(
        self, strategy_id: str, run_id: str | None
    ) -> BacktestResultRow | None:
        """live と期間整合 diff を取るための backtest_results 1 行を返す。

        ``run_id`` 指定時はその ID を、未指定時は ``strategy_id`` の最新
        （``run_at`` 降順 1 件目）を返す。該当無し / DB 未到達時は ``None``。
        """
        if self._backtest_repo is None:
            return None
        if run_id:
            return self._backtest_repo.get_result(run_id)
        rows = self._backtest_repo.list_results(strategy_id=strategy_id)
        return rows[0] if rows else None
