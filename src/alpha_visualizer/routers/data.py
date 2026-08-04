"""保有ヒストリカルデータ API ルーター（issue #484 / #485）。

- ``GET /api/data`` → 保有データ一覧（`alpha-forge data list --json` 委譲 + 鮮度付加）
- ``POST /api/data/jobs`` → 202 + JobSummary。data fetch / update を既存ジョブ基盤
  （JobManager + SSE）で非同期実行する（観察・キャンセルは /api/jobs 系を共用）

一覧は **visualizer 側で parquet を直読みしない**（データ保存は forge が
single-writer。一覧の算出を複製するとフォーマット変更のたびに壊れる）。

鮮度（updated_at / stale）だけは visualizer 側で付加する。CLI の応答に最終
更新時刻が無いため、parquet の mtime を stat で参照する。ファイルの**内容**は
読まないので single-writer 原則とは衝突しない。
"""
from __future__ import annotations

import datetime
import logging
import pathlib
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from alpha_visualizer.dependencies import get_forge_config_dep, get_job_manager
from alpha_visualizer.errors import ForgeCliNotFoundError, LocalWriteDisabledError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers.jobs import JobSummary, _to_summary
from alpha_visualizer.schemas.data import (
    CreateDataJobRequest,
    DataListResponse,
    DataSetItem,
)
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    resolve_forge_exe,
)
from alpha_visualizer.services.forge_sync import run_forge_json
from alpha_visualizer.services.jobs import JobManager

logger = logging.getLogger(__name__)

router = APIRouter()

LIST_TIMEOUT_SEC = 60

LOCAL_WRITE_DISABLED_MESSAGE = (
    "この操作は localhost でのみ利用できます（LAN 公開中は無効）"
    " / This operation is only available on localhost"
)

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


@router.post("/data/jobs", response_model=JobSummary, status_code=202)
async def create_data_job(
    body: CreateDataJobRequest,
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """データ取得（fetch）/ 一括差分更新（update）ジョブを起動する。

    ネットワークアクセスとファイル生成を伴う書き込み系のため、非 loopback
    公開中は 403 で拒否する（routers/agent.py と同じ方針）。forge 未導入は
    ジョブを積んでから失敗させず、起動前に fail-fast する。
    """
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)
    if resolve_forge_exe() is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)

    record = await manager.create(
        kind="data_fetch" if body.action == "fetch" else "data_update",
        strategy_id="",  # データ系ジョブは戦略に紐付かない
        symbol=body.symbol or "",
        period=body.period,
        interval=body.interval,
    )
    return _to_summary(record)
