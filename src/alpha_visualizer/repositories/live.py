"""ライブ実績 Repository。

`<live_dir>/summaries/<strategy_id>.live.summary.json` および
`<live_dir>/trades/<strategy_id>.trades.json` といった JSON ファイル群と、
`backtest_results` テーブルからの 1 行取得（live と期間整合した diff
計算に使う）をひとまとめに扱う Read-only Repository。

Router 層からは本クラスを ``Depends`` で受け取り、HTTP 変換と純粋な
集計ロジックのみを担当できるようにする。``backtest_results`` への
アクセスは ``BacktestResultsRepository`` に委譲する（合成）。
"""
from __future__ import annotations

import json
import logging
import pathlib
from typing import Any

from sqlalchemy import Engine

from alpha_visualizer.repositories.backtest_results import (
    BacktestResultRow,
    BacktestResultsRepository,
)

logger = logging.getLogger(__name__)

_SUMMARY_SUFFIX = ".live.summary.json"
_TRADES_SUFFIX = ".trades.json"


class LiveDataRepository:
    """ライブ実績データ（JSON ファイル群 + ``backtest_results`` 行）の Repository。

    `live_dir` 配下の JSON は SQLAlchemy の対象外のため、ファイルシステム
    操作と JSON パースをこのクラスに集約する。``backtest_results`` への
    クエリは ``BacktestResultsRepository`` に委譲し、SQL アクセスを 1 箇所
    にまとめる。
    """

    def __init__(
        self,
        engine: Engine,
        *,
        live_dir: pathlib.Path,
        backtest_repo: BacktestResultsRepository | None = None,
    ) -> None:
        self._engine = engine
        self._live_dir = live_dir
        self._backtest_repo = backtest_repo or BacktestResultsRepository(engine)

    # ------------------------------------------------------------------
    # パス解決ユーティリティ
    # ------------------------------------------------------------------
    @property
    def live_dir(self) -> pathlib.Path:
        return self._live_dir

    def summary_path(self, strategy_id: str) -> pathlib.Path:
        return self._live_dir / "summaries" / f"{strategy_id}{_SUMMARY_SUFFIX}"

    def trades_path(self, strategy_id: str) -> pathlib.Path:
        return self._live_dir / "trades" / f"{strategy_id}{_TRADES_SUFFIX}"

    def has_summary(self, strategy_id: str) -> bool:
        return self.summary_path(strategy_id).exists()

    def has_trades(self, strategy_id: str) -> bool:
        return self.trades_path(strategy_id).exists()

    # ------------------------------------------------------------------
    # JSON 読み取り
    # ------------------------------------------------------------------
    @staticmethod
    def read_json_safe(path: pathlib.Path) -> Any:
        """JSON ファイルを安全に読む。不在 / パース失敗時は ``None``。"""
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("JSON 読み取り失敗 %s: %s", path, exc)
            return None

    def list_summary_strategy_ids(self) -> list[str]:
        """``summaries/`` ディレクトリから戦略 ID 集合を抽出してソート済みで返す。"""
        summaries_dir = self._live_dir / "summaries"
        if not summaries_dir.exists():
            return []
        ids: set[str] = set()
        for path in summaries_dir.glob(f"*{_SUMMARY_SUFFIX}"):
            name = path.name
            if name.endswith(_SUMMARY_SUFFIX):
                ids.add(name[: -len(_SUMMARY_SUFFIX)])
        return sorted(ids)

    def load_summary(self, strategy_id: str) -> dict[str, Any] | None:
        """live summary JSON を辞書で返す。形式不正なら ``None``。"""
        raw = self.read_json_safe(self.summary_path(strategy_id))
        if not isinstance(raw, dict):
            return None
        return raw

    def load_raw_trades(self, strategy_id: str) -> list[dict[str, Any]]:
        """live trades JSON を「dict のリスト」に正規化して返す。

        ファイルが list ならそのまま、dict なら ``trades`` キー配下のリスト
        を採用し、要素が dict でないものは捨てる。形式不正なら空リスト。
        正規化（``entry_at`` 等のフィールド整形）は呼び出し側で行う。
        """
        raw = self.read_json_safe(self.trades_path(strategy_id))
        if raw is None:
            return []
        if isinstance(raw, list):
            items: list[Any] = raw
        elif isinstance(raw, dict):
            items = list(raw.get("trades") or [])
        else:
            return []
        return [item for item in items if isinstance(item, dict)]

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
        if run_id:
            return self._backtest_repo.get_result(run_id)
        rows = self._backtest_repo.list_results(strategy_id=strategy_id)
        return rows[0] if rows else None
