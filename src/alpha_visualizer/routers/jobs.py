"""非同期ジョブ API ルーター（GUI化 Wave B, #292）。

forge CLI の長時間処理（backtest / optimize / walk-forward）をジョブとして
起動・参照・キャンセルする。進捗ログは SSE（Server-Sent Events）で配信する。

- ``POST /api/jobs`` → 202 + ジョブサマリ（即時返却）
- ``GET /api/jobs`` → 新しい順のサマリ一覧
- ``GET /api/jobs/{job_id}`` → 詳細（ログ末尾・結果要約付き）
- ``POST /api/jobs/{job_id}/cancel`` → キャンセル要求
- ``GET /api/jobs/{job_id}/events`` → SSE 進捗ストリーム
"""
from __future__ import annotations

import json
import pathlib
import tempfile
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from alpha_visualizer.dependencies import get_job_manager, get_strategies_repo
from alpha_visualizer.errors import InvalidRequestError, NotFoundError
from alpha_visualizer.repositories.strategies import StrategiesRepository
from alpha_visualizer.services.jobs import (
    TERMINAL_STATUSES,
    JobManager,
    JobRecord,
)
from alpha_visualizer.services.tuning import build_override_file

router = APIRouter()

# SSE の待機スライス。クライアント切断後もジェネレータは次の yield まで
# 生存するため、待機を短く刻んで滞留時間を最大この秒数に抑える
# （アイドル時はこの間隔でハートビートコメントを送る。keep-alive を兼ねる）。
SSE_WAIT_SLICE_SEC = 2.0
# 詳細レスポンスに含めるログ末尾の行数
DETAIL_LOG_TAIL_LINES = 100


class CreateJobRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    kind: Literal["backtest", "optimize", "wft"]
    strategy_id: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    # trials は optimize、windows は wft でのみ意味を持つ（他 kind では無視）
    trials: int | None = Field(default=None, ge=1, le=1000)
    windows: int | None = Field(default=None, ge=2, le=20)
    # チューニング実行（#293）: backtest 専用。指定キーだけ上書きした一時戦略
    # ファイルで実行する（元の戦略定義は変更しない）。値の検証は
    # services/tuning.build_override_file が行う。
    parameters: dict[str, Any] | None = Field(default=None, max_length=100)


class JobSummary(BaseModel):
    job_id: str
    kind: str
    strategy_id: str
    symbol: str
    status: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None


class JobDetail(JobSummary):
    returncode: int | None
    result: dict[str, Any] | None
    log_tail: str | None


def _to_summary(record: JobRecord) -> JobSummary:
    return JobSummary(
        job_id=record.job_id,
        kind=record.kind,
        strategy_id=record.strategy_id,
        symbol=record.symbol,
        status=record.status,
        created_at=record.created_at,
        started_at=record.started_at,
        finished_at=record.finished_at,
        error=record.error,
    )


def _to_detail(manager: JobManager, record: JobRecord) -> JobDetail:
    seq, lines = manager.log_since(
        record.job_id, max(0, record.log_seq - DETAIL_LOG_TAIL_LINES)
    )
    return JobDetail(
        **_to_summary(record).model_dump(),
        returncode=record.returncode,
        result=record.result,
        log_tail="\n".join(lines) if lines else None,
    )


def _get_or_404(manager: JobManager, job_id: str) -> JobRecord:
    record = manager.get(job_id)
    if record is None:
        raise NotFoundError(f"ジョブが見つかりません / Job not found: {job_id}")
    return record


@router.post("/jobs", response_model=JobSummary, status_code=202)
async def create_job(
    body: CreateJobRequest,
    manager: Annotated[JobManager, Depends(get_job_manager)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
) -> JobSummary:
    """ジョブを起動し、実行を待たずにサマリを返す。

    ``parameters`` 指定時（チューニング実行 #293）は、元の戦略定義の
    parameters だけを差し替えた一時ファイルを作り ``--strategy-file`` で
    実行する。一時ファイルはジョブ終了時に JobManager が削除する。
    """
    strategy_file: str | None = None
    if body.parameters is not None:
        if body.kind != "backtest":
            raise InvalidRequestError(
                "parameters はチューニング実行（kind=backtest）専用です"
                " / parameters is only supported for kind=backtest",
            )
        row = strategies_repo.get_strategy(body.strategy_id)
        if row is None:
            raise NotFoundError(
                f"戦略が見つかりません / Strategy not found: {body.strategy_id}",
            )
        strategy_file = str(
            build_override_file(
                row.raw_definition,
                body.parameters,
                pathlib.Path(tempfile.gettempdir()),
            )
        )

    try:
        record = await manager.create(
            kind=body.kind,
            strategy_id=body.strategy_id,
            symbol=body.symbol,
            trials=body.trials,
            windows=body.windows,
            strategy_file=strategy_file,
        )
    except Exception:
        # create が拒否（流量ガード 429 等）された場合、JobRecord に紐付かない
        # 一時ファイルは _finish() の掃除を通らないためここで回収する。
        if strategy_file is not None:
            pathlib.Path(strategy_file).unlink(missing_ok=True)
        raise
    return _to_summary(record)


# 参照系も async def にする: 同期 def だと FastAPI がスレッドプールで実行し、
# イベントループ上の JobManager（ロック無し前提）の状態を別スレッドから読む
# ことになり、_append_log との競合で不整合な log_tail/seq を返しうる。
@router.get("/jobs", response_model=list[JobSummary])
async def list_jobs(
    manager: Annotated[JobManager, Depends(get_job_manager)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[JobSummary]:
    """新しい順のジョブサマリ一覧。"""
    return [_to_summary(r) for r in manager.list()[:limit]]


@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(
    job_id: str,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobDetail:
    """ジョブ詳細（ログ末尾・結果要約付き）。"""
    return _to_detail(manager, _get_or_404(manager, job_id))


@router.post("/jobs/{job_id}/cancel", response_model=JobSummary)
async def cancel_job(
    job_id: str,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """ジョブをキャンセルする（終了済みなら現状を返すだけ）。"""
    _get_or_404(manager, job_id)
    record = await manager.cancel(job_id)
    return _to_summary(record)


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/jobs/{job_id}/events")
async def job_events(
    job_id: str,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> StreamingResponse:
    """ジョブ進捗の SSE ストリーム。

    snapshot（現在の全ログ + 状態）→ log（新規行）→ status（終了）を配信し、
    terminal 到達で接続を閉じる。待ちの間はハートビートコメントを送る。
    """
    _get_or_404(manager, job_id)

    async def event_stream() -> AsyncIterator[str]:
        record = manager.get(job_id)
        if record is None:
            return
        seq, lines = manager.log_since(job_id, 0)
        yield _sse(
            {
                "type": "snapshot",
                "status": record.status,
                "lines": lines,
                "seq": seq,
            }
        )
        sent_seq = seq
        version = manager.version
        # ログの連続性は sent_seq ベースの log_since 再取得が保証する。
        # version はウェイクアップのヒントに過ぎず、通知を取り逃しても
        # 次のループで seq 差分から必ず回収される。
        while True:
            record = manager.get(job_id)
            if record is None:
                # 保持上限による間引きでジョブが消えた（通常は起きない）
                return
            new_seq, new_lines = manager.log_since(job_id, sent_seq)
            if new_lines:
                yield _sse({"type": "log", "lines": new_lines, "seq": new_seq})
                sent_seq = new_seq
            if record.status in TERMINAL_STATUSES:
                yield _sse(
                    {
                        "type": "status",
                        "status": record.status,
                        "result": record.result,
                        "error": record.error,
                    }
                )
                return
            changed = await manager.wait_change(version, timeout=SSE_WAIT_SLICE_SEC)
            version = manager.version
            if not changed:
                # コメント行はイベントとして解釈されない（keep-alive 用）
                yield ": heartbeat\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx 等のリバースプロキシでのバッファリング抑止
            "X-Accel-Buffering": "no",
        },
    )
