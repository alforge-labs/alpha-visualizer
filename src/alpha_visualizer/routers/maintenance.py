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
import subprocess
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.requests import Request

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.errors import ExternalProcessError, ForgeCliNotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.maintenance import (
    OrphanRunsResponse,
    PruneOrphansRequest,
    PruneOrphansResponse,
)
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    build_forge_env,
    mask_home,
    parse_json_lenient,
    resolve_forge_exe,
    translate_forge_failure,
)

logger = logging.getLogger(__name__)

router = APIRouter()

#: 一覧は forge の起動コストが支配的になりうる。VACUUM を伴う削除は
#: DB サイズ次第で伸びるため長めに取る。
LIST_TIMEOUT_SEC = 60
PRUNE_TIMEOUT_SEC = 900


def _run_forge(argv: list[str], forge_cfg: ForgeConfig, timeout: int) -> dict[str, Any]:
    """forge を同期実行し、stdout の JSON を返す。"""
    exe = resolve_forge_exe()
    if exe is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)

    try:
        proc = subprocess.run(
            [exe, *argv],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=build_forge_env(forge_cfg),
            cwd=str(forge_cfg.forge_dir),
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as e:
        raise ExternalProcessError(f"forge がタイムアウトしました（{timeout} 秒）") from e

    if proc.returncode != 0:
        # 空一覧を返して「掃除済み」と誤読させてはいけない
        # 既知の失敗（EULA 未同意 / forge が古くサブコマンドを持たない）は、
        # 生の Click 出力ではなく次の一歩を示す案内に変換する。
        guidance = translate_forge_failure(proc.stdout or "", proc.stderr or "")
        if guidance is not None:
            raise ExternalProcessError(guidance)
        raw = proc.stderr or proc.stdout or ""
        detail = mask_home(raw.strip())
        raise ExternalProcessError(f"forge が異常終了しました（exit {proc.returncode}）: {detail}")

    payload = parse_json_lenient(proc.stdout)
    if payload is None:
        raise ExternalProcessError("forge の出力を JSON として解釈できませんでした")
    return payload


@router.get("/maintenance/orphan-runs", response_model=OrphanRunsResponse)
def list_orphan_runs(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> OrphanRunsResponse:
    # --dry-run を必ず付ける。付け忘れると一覧を見ただけで削除が走る
    payload = _run_forge(
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

    payload = _run_forge(argv, forge_cfg, PRUNE_TIMEOUT_SEC)
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
