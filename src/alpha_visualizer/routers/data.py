"""保有ヒストリカルデータ API ルーター（issue #484）。

`GET /api/data` を提供する。一覧は `alpha-forge data list --json` に委譲し、
**visualizer 側で parquet を直読みしない**（データ保存は forge が single-writer。
一覧の算出を複製するとフォーマット変更のたびに壊れる）。

鮮度（updated_at / stale）だけは visualizer 側で付加する。CLI の応答に最終
更新時刻が無いため、parquet の mtime を stat で参照する。ファイルの**内容**は
読まないので single-writer 原則とは衝突しない。
"""
from __future__ import annotations

import datetime
import logging
import pathlib
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.data import DataListResponse, DataSetItem
from alpha_visualizer.services.forge_sync import run_forge_json

logger = logging.getLogger(__name__)

router = APIRouter()

LIST_TIMEOUT_SEC = 60

#: 「要更新」判定の TTL。forge の `data.cache_ttl_hours` 既定値（24h）に合わせる。
#: forge.yaml の同項目は読まない — visualizer が forge 設定の解釈を持つと
#: 双方の既定値・解釈がずれたときに誤った鮮度を表示するため、固定の目安に留める。
DATA_STALE_TTL_HOURS = 24


def _annotate_freshness(
    raw: dict[str, Any], now: datetime.datetime
) -> DataSetItem:
    """CLI の datasets[] 1 要素に mtime 由来の鮮度を付加する。

    ファイル不在・stat 失敗は「鮮度不明（None）」とし、一覧全体を壊さない。
    ``file_path``（ローカル絶対パス）はここで落とす。
    """
    updated_at: str | None = None
    stale: bool | None = None
    file_path = raw.get("file_path")
    if isinstance(file_path, str) and file_path:
        try:
            mtime_ts = pathlib.Path(file_path).stat().st_mtime
        except OSError:
            logger.warning("parquet の mtime を取得できません: %s", file_path)
        else:
            mtime = datetime.datetime.fromtimestamp(mtime_ts, tz=datetime.UTC)
            updated_at = mtime.isoformat()
            stale = (now - mtime) > datetime.timedelta(hours=DATA_STALE_TTL_HOURS)
    return DataSetItem(
        symbol=raw.get("symbol", ""),
        interval=raw.get("interval", ""),
        start=str(raw.get("start", "")),
        end=str(raw.get("end", "")),
        rows=int(raw.get("rows", 0)),
        size_bytes=int(raw.get("size_bytes", 0)),
        updated_at=updated_at,
        stale=stale,
    )


@router.get("/data", response_model=DataListResponse)
def list_datasets(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> DataListResponse:
    payload = run_forge_json(["data", "list", "--json"], forge_cfg, LIST_TIMEOUT_SEC)
    now = datetime.datetime.now(datetime.UTC)
    datasets = [
        _annotate_freshness(item, now)
        for item in payload.get("datasets", [])
        if isinstance(item, dict)
    ]
    return DataListResponse(datasets=datasets, count=payload.get("count", 0))
