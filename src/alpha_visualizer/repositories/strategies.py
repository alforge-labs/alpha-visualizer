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
    ) -> None:
        self._db_engine = strategies_db_engine
        self._strategies_dir = strategies_dir

    @classmethod
    def from_paths(
        cls,
        *,
        strategies_dir: Path,
        strategies_db: Path | None,
    ) -> StrategiesRepository:
        """パスから Engine を解決して Repository を構築する。

        ``strategies_db`` が ``None`` または存在しないファイルの場合は
        JSON モードにフォールバックする。
        """
        engine = (
            get_engine(strategies_db)
            if strategies_db is not None and strategies_db.exists()
            else None
        )
        return cls(strategies_db_engine=engine, strategies_dir=strategies_dir)

    # --- 公開 API -------------------------------------------------------------

    def list_strategies(self) -> list[StrategyRow]:
        """戦略定義を全件返す（DB モード優先、JSON モードへフォールバック）。"""
        if self._db_engine is not None:
            return self._load_from_db()
        return self._load_from_json_dir()

    def get_strategy(self, strategy_id: str) -> StrategyRow | None:
        """``strategy_id`` に一致する 1 件を返す。存在しなければ ``None``。"""
        for row in self.list_strategies():
            if row.strategy_id == strategy_id:
                return row
        return None

    def find_by_ids(self, ids: list[str]) -> list[StrategyRow]:
        """指定 ID 群に該当する行のみを返す（重複は無視、順序は内部リスト順）。"""
        wanted = set(ids)
        return [r for r in self.list_strategies() if r.strategy_id in wanted]

    # --- 内部実装 -------------------------------------------------------------

    def _load_from_db(self) -> list[StrategyRow]:
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
            try:
                raw = path.read_text(encoding="utf-8")
                data = json.loads(raw)
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("戦略ファイル読み込み失敗: %s (%s)", path, exc)
                continue
            if not isinstance(data, dict):
                continue
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
            out.append(
                StrategyRow(
                    strategy_id=sid,
                    name=str(data.get("name") or sid),
                    version=_optional_str(data.get("version")),
                    asset_type=_optional_str(data.get("asset_type")),
                    timeframe=_optional_str(data.get("timeframe")),
                    tags=tuple(_parse_tags(tags_raw)),
                    target_symbols=tuple(target_symbols),
                    raw_definition=raw,
                )
            )
        return out


def _optional_str(value: object) -> str | None:
    """値が ``None`` の場合は ``None``、それ以外は ``str()`` 変換した値を返す。"""
    if value is None:
        return None
    return str(value)
