"""戦略 Repository。

戦略定義は次のいずれかの形で保存される:
- DB モード: strategies.db の strategies テーブル（forge.yaml で use_db=true 時）
- JSON モード: <strategies_dir>/*.json

本 Repository は両モードを内部で吸収し、Router 層には統一インタフェース
を提供する。
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Engine, select

from alpha_visualizer.db import get_engine
from alpha_visualizer.db import strategies as strategies_table
from alpha_visualizer.errors import DataSourceUnavailableError

logger = logging.getLogger(__name__)


def _parse_tags(raw: object) -> list[str]:
    """tags 列を ``list[str]`` に正規化する。

    DB モード（TEXT 列の JSON 文字列）と JSON モード（list） の両方に対応する。
    """
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(t) for t in raw if t]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [str(t) for t in parsed if t]
    return []


def _extract_target_symbols(definition_json: str | None) -> list[str]:
    """``definition_json`` から ``target_symbols`` を抽出する。"""
    if not definition_json:
        return []
    try:
        data = json.loads(definition_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, dict):
        return []
    syms = data.get("target_symbols") or []
    if not isinstance(syms, list):
        return []
    return [str(s) for s in syms if s]


@dataclass(frozen=True)
class StrategyRow:
    """戦略 1 件を表す不変 DTO。

    ``raw_definition`` は戦略定義 JSON 文字列。Service 層で ``json.loads`` して
    parameters / indicators / entry_conditions などの構造化フィールドへアクセスする。
    """

    strategy_id: str
    name: str
    version: str | None
    asset_type: str | None
    timeframe: str | None
    tags: tuple[str, ...] = ()
    target_symbols: tuple[str, ...] = ()
    raw_definition: str = ""


class StrategiesRepository:
    """戦略定義の DB / JSON 両モードを吸収する Repository。"""

    def __init__(
        self,
        *,
        strategies_db_engine: Engine | None,
        strategies_dir: Path,
        strategies_db: Path | None = None,
    ) -> None:
        """
        Args:
            strategies_db_engine: ``strategies.db`` への Engine。DB モード設定でも
                ファイルが無いときは ``None`` になる。
            strategies_dir: JSON モードで戦略を探すディレクトリ。
            strategies_db: forge.yaml で ``strategies.use_db: true`` のときに解決
                される ``strategies.db`` のパス（**ファイルが無くても非 None** で
                「DB モード設定」を表す）。JSON モードでは ``None``。これが非 None
                かつ Engine が ``None``（DB 不在）のときは、黙って JSON へフォール
                バックせず明示エラーにする（Fail Loud）。
        """
        self._db_engine = strategies_db_engine
        self._strategies_dir = strategies_dir
        self._strategies_db = strategies_db

    @classmethod
    def from_paths(
        cls,
        *,
        strategies_dir: Path,
        strategies_db: Path | None,
    ) -> StrategiesRepository:
        """パスから Engine を解決して Repository を構築する。

        ``strategies_db`` が指定されていれば DB モード。そのうえでファイルが存在
        すれば Engine を張る。``strategies_db`` が ``None`` のときは JSON モード。
        """
        engine = (
            get_engine(strategies_db)
            if strategies_db is not None and strategies_db.exists()
            else None
        )
        return cls(
            strategies_db_engine=engine,
            strategies_dir=strategies_dir,
            strategies_db=strategies_db,
        )

    # --- 公開 API -------------------------------------------------------------

    def list_strategies(self) -> list[StrategyRow]:
        """戦略定義を全件返す。

        - Engine あり → DB モード（strategies テーブルから取得）
        - Engine なし & DB モード設定 → ``DataSourceUnavailableError``（Fail Loud）。
          stale な JSON を最新と誤認させないため、黙って JSON へ落とさない。
        - Engine なし & JSON モード → JSON ディレクトリから取得（正規経路）
        """
        if self._db_engine is not None:
            return self._load_from_db()
        self._raise_if_db_configured_but_missing()
        return self._load_from_json_dir()

    def get_strategy(self, strategy_id: str) -> StrategyRow | None:
        """``strategy_id`` に一致する 1 件を返す。存在しなければ ``None``。

        全件ロードの線形走査を避ける fast path 付き (issue #386):

        - DB モード → ``WHERE strategy_id = ?`` の 1 件 SELECT
        - JSON モード → まず ``<strategy_id>.json`` だけを読む。ファイル名 stem と
          strategy_id が一致しない既存データのために全走査へフォールバックする
        """
        if self._db_engine is not None:
            rows = self._load_from_db(ids=[strategy_id])
            return rows[0] if rows else None
        self._raise_if_db_configured_but_missing()

        candidate = self._load_json_file(self._strategies_dir / f"{strategy_id}.json")
        if candidate is not None and candidate.strategy_id == strategy_id:
            return candidate
        for row in self._load_from_json_dir():
            if row.strategy_id == strategy_id:
                return row
        return None

    def find_by_ids(self, ids: list[str]) -> list[StrategyRow]:
        """指定 ID 群に該当する行のみを返す（重複は無視、順序は内部リスト順）。

        DB モードは ``WHERE strategy_id IN (...)`` で対象行のみ取得する
        (issue #386)。JSON モードはファイル名と strategy_id の不一致がありうる
        ため全走査を維持する（compare 上限 20 件・単一ディレクトリで十分軽い）。
        """
        if self._db_engine is not None:
            return self._load_from_db(ids=ids)
        wanted = set(ids)
        return [r for r in self.list_strategies() if r.strategy_id in wanted]

    def _raise_if_db_configured_but_missing(self) -> None:
        """DB モード設定なのに strategies.db が無い場合の Fail Loud 共通ガード。"""
        if self._strategies_db is not None:
            raise DataSourceUnavailableError(
                "strategies.use_db=true ですが strategies.db が見つかりません: "
                f"{self._strategies_db}. "
                "forge で戦略を保存して DB を生成するか、forge.yaml の "
                "strategies.path / db_filename を確認してください。"
            )

    # --- 内部実装 -------------------------------------------------------------

    def _load_from_db(self, ids: list[str] | None = None) -> list[StrategyRow]:
        """strategies テーブルから読む。``ids`` 指定時は該当行のみ (issue #386)。"""
        if self._db_engine is None:
            raise RuntimeError("_load_from_db を呼ぶには DB Engine が必要です")
        stmt = select(
            strategies_table.c.strategy_id,
            strategies_table.c.name,
            strategies_table.c.version,
            strategies_table.c.asset_type,
            strategies_table.c.timeframe,
            strategies_table.c.tags,
            strategies_table.c.definition_json,
        )
        if ids is not None:
            stmt = stmt.where(strategies_table.c.strategy_id.in_(ids))
        with self._db_engine.connect() as conn:
            rows = conn.execute(stmt).all()

        out: list[StrategyRow] = []
        for r in rows:
            # DB モードでは tags 列（TEXT JSON）をそのまま採用し、
            # target_symbols は definition_json から抽出する。
            out.append(
                StrategyRow(
                    strategy_id=r.strategy_id,
                    name=r.name,
                    version=r.version,
                    asset_type=r.asset_type,
                    timeframe=r.timeframe,
                    tags=tuple(_parse_tags(r.tags)),
                    target_symbols=tuple(
                        _extract_target_symbols(r.definition_json)
                    ),
                    raw_definition=r.definition_json or "",
                )
            )
        return out

    def _load_from_json_dir(self) -> list[StrategyRow]:
        if not self._strategies_dir.exists():
            return []
        out: list[StrategyRow] = []
        for path in sorted(self._strategies_dir.glob("*.json")):
            row = self._load_json_file(path)
            if row is not None:
                out.append(row)
        return out

    def _load_json_file(self, path: Path) -> StrategyRow | None:
        """単一 JSON ファイルを StrategyRow に変換する（不正・不在は ``None``）。"""
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except FileNotFoundError:
            # fast path (issue #386) で <id>.json が無いだけの正常系。警告不要
            return None
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("戦略ファイル読み込み失敗: %s (%s)", path, exc)
            return None
        if not isinstance(data, dict):
            return None
        sid = data.get("strategy_id")
        if not isinstance(sid, str):
            # ファイル名 stem をフォールバックに使う既存挙動を踏襲
            sid = path.stem
        tags_raw = data.get("tags")
        target_symbols_raw = data.get("target_symbols") or []
        target_symbols = (
            [str(s) for s in target_symbols_raw if s]
            if isinstance(target_symbols_raw, list)
            else []
        )
        return StrategyRow(
            strategy_id=sid,
            name=str(data.get("name") or sid),
            version=_optional_str(data.get("version")),
            asset_type=_optional_str(data.get("asset_type")),
            timeframe=_optional_str(data.get("timeframe")),
            tags=tuple(_parse_tags(tags_raw)),
            target_symbols=tuple(target_symbols),
            raw_definition=raw,
        )


def _optional_str(value: object) -> str | None:
    """値が ``None`` の場合は ``None``、それ以外は ``str()`` 変換した値を返す。"""
    if value is None:
        return None
    return str(value)
