"""メンテナンス API ルーター

`GET/DELETE /api/maintenance/orphan-runs` を提供する。

孤児（戦略定義がもう存在しない strategy_id の実行結果）の一覧と削除を、
`alpha-forge backtest prune-orphans` に委譲する。**visualizer 側で孤児を算出しない。**
visualizer は規約上 alpha_forge を import できず、組み込みテンプレート戦略の存在を
知らないため、自前で算出すると実行可能な戦略を孤児として表示してしまう
（設計仕様 §4.2）。
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.requests import Request

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.maintenance import (
    OrphanRunsResponse,
    PruneOrphansRequest,
    PruneOrphansResponse,
)
from alpha_visualizer.services.forge_sync import run_forge_json

logger = logging.getLogger(__name__)

router = APIRouter()

#: 一覧は forge の起動コストが支配的になりうる。VACUUM を伴う削除は
#: DB サイズ次第で伸びるため長めに取る。
LIST_TIMEOUT_SEC = 60
PRUNE_TIMEOUT_SEC = 900


@router.get("/maintenance/orphan-runs", response_model=OrphanRunsResponse)
def list_orphan_runs(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> OrphanRunsResponse:
    # --dry-run を必ず付ける。付け忘れると一覧を見ただけで削除が走る
    payload = run_forge_json(
        ["backtest", "prune-orphans", "--dry-run", "--json"],
        forge_cfg,
        LIST_TIMEOUT_SEC,
    )
    return OrphanRunsResponse(
        orphans=payload.get("orphans", []),
        count=payload.get("count", 0),
        total_bytes=payload.get("total_bytes", 0),
    )


@router.delete("/maintenance/orphan-runs", response_model=PruneOrphansResponse)
def prune_orphan_runs(
    request: Request,
    body: PruneOrphansRequest,
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> PruneOrphansResponse:
    # forge は --strategy 省略時に「全孤児」を対象にする。空配列をそのまま
    # 組み立てると、選択 0 件の削除が全件削除になる。ここで必ず止める。
    if not body.strategy_ids:
        raise HTTPException(status_code=400, detail="削除する strategy_id が指定されていません")

    # VACUUM は DB 全体の排他ロックを取る。この画面は直読みしないが、
    # Browse / Detail など他画面が同じ Engine を使っており接続が残っている。
    engine = getattr(request.app.state, "engine", None)
    if engine is not None:
        engine.dispose()

    argv = ["backtest", "prune-orphans", "-y", "--vacuum", "--json"]
    for strategy_id in body.strategy_ids:
        argv += ["--strategy", strategy_id]

    payload = run_forge_json(argv, forge_cfg, PRUNE_TIMEOUT_SEC)
    deleted = payload.get("deleted") or {}
    before = int(deleted.get("bytes_before", 0))
    after = int(deleted.get("bytes_after", 0))
    return PruneOrphansResponse(
        deleted_strategy_ids=list(deleted.get("strategy_ids", [])),
        deleted_backtest_rows=int(deleted.get("backtest_rows", 0)),
        deleted_optimization_rows=int(deleted.get("optimization_rows", 0)),
        reclaimed_bytes=max(0, before - after),
        vacuum_error=deleted.get("vacuum_error"),
    )
