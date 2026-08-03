"""AI 戦略開発（Agent Develop）API ルーター。

- ``GET /api/agent/backends`` → claude / codex の検出結果と機能有効状態
- ``POST /api/agent/jobs`` → 202 + JobSummary（観察・キャンセルは既存 /api/jobs 系）

設計: docs/superpowers/specs/2026-08-02-agent-develop-design.md
"""
from __future__ import annotations

import asyncio
from typing import Annotated, get_args

from fastapi import APIRouter, Depends, Request

from alpha_visualizer.dependencies import get_forge_config_dep, get_job_manager
from alpha_visualizer.errors import (
    AgentCliNotFoundError,
    AgentDisabledError,
    ForgeCliNotFoundError,
)
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers.jobs import JobSummary, _to_summary
from alpha_visualizer.schemas.agent import (
    AgentBackendInfo,
    AgentBackendsResponse,
    CreateAgentJobRequest,
)
from alpha_visualizer.services.agent_cli import (
    AGENT_NOT_FOUND_MESSAGES,
    AgentBackend,
    agent_version,
    resolve_agent_exe,
)
from alpha_visualizer.services.agent_prompt import build_agent_prompt
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    resolve_forge_exe,
)
from alpha_visualizer.services.jobs import JobManager

router = APIRouter()

AGENT_DISABLED_MESSAGE = (
    "AI 戦略開発は localhost でのみ利用できます（LAN 公開中は無効）"
    " / Agent development is only available on localhost"
)


async def _version_or_none(exe: str | None) -> str | None:
    """検出できた実行ファイルにだけ ``--version`` を叩く（gather 用の薄い包み）。"""
    return await agent_version(exe) if exe is not None else None


@router.get("/agent/backends", response_model=AgentBackendsResponse)
async def list_agent_backends(request: Request) -> AgentBackendsResponse:
    """エージェントバックエンドの検出結果を返す（GUI の選択肢構築用）。

    無効時（非 loopback 公開中）は CLI 検出・``--version`` 実行を一切行わず
    403 を返す（設計: docs/superpowers/specs/2026-08-02-agent-develop-design.md
    セキュリティ設計 #3）。検出結果の開示自体が任意コード実行の下調べに
    使われうるため、POST と同様にエンドポイント冒頭で遮断する。
    """
    if not request.app.state.agent_enabled:
        raise AgentDisabledError(AGENT_DISABLED_MESSAGE)
    ids: tuple[AgentBackend, ...] = get_args(AgentBackend)
    exes = [resolve_agent_exe(backend) for backend in ids]
    # --version は並列に叩く: 直列だと両方が詰まったときタイムアウト 2 回分
    # （最悪 10 秒）ナビの表示がブロックされる
    versions = await asyncio.gather(*(_version_or_none(exe) for exe in exes))
    return AgentBackendsResponse(
        enabled=True,
        backends=[
            AgentBackendInfo(id=backend, available=exe is not None, version=version)
            for backend, exe, version in zip(ids, exes, versions, strict=True)
        ],
    )


@router.post("/agent/jobs", response_model=JobSummary, status_code=202)
async def create_agent_job(
    body: CreateAgentJobRequest,
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
    cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> JobSummary:
    """クイック戦略開発ジョブを起動する。

    実行前に「機能有効・forge 導入済み・agent CLI 導入済み」を確認して
    fail-fast する（エージェント起動後に判明すると原因がログの奥に埋まる）。
    """
    if not request.app.state.agent_enabled:
        raise AgentDisabledError(AGENT_DISABLED_MESSAGE)
    if resolve_forge_exe() is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)
    if resolve_agent_exe(body.backend) is None:
        raise AgentCliNotFoundError(AGENT_NOT_FOUND_MESSAGES[body.backend])

    prompt = build_agent_prompt(
        goal=body.goal,
        symbol=body.symbol,
        strategies_dir=cfg.strategies_dir,
        # ForgeConfig が解決した実パスを使う。<forge_dir>/forge.yaml 規約を
        # ここで再実装すると、別置き yaml 運用（--forge-config / FORGE_CONFIG）
        # ではピンが効かず、ログインシェル rc の上書き問題が再発する
        forge_config_path=cfg.config_path,
    )
    record = await manager.create(
        kind="agent",
        strategy_id="",  # 生成物の id はジョブ完了時に判明し書き戻される
        symbol=body.symbol or "",
        goal=body.goal,
        backend=body.backend,
        prompt=prompt,
    )
    return _to_summary(record)
