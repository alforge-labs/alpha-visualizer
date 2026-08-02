"""AI 戦略開発（Agent Develop）API ルーター。

- ``GET /api/agent/backends`` → claude / codex の検出結果と機能有効状態
- ``POST /api/agent/jobs`` → 202 + JobSummary（観察・キャンセルは既存 /api/jobs 系）

設計: docs/superpowers/specs/2026-08-02-agent-develop-design.md
"""
from __future__ import annotations

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


@router.get("/agent/backends", response_model=AgentBackendsResponse)
async def list_agent_backends(request: Request) -> AgentBackendsResponse:
    """エージェントバックエンドの検出結果を返す（GUI の選択肢構築用）。"""
    backends: list[AgentBackendInfo] = []
    for backend in get_args(AgentBackend):
        exe = resolve_agent_exe(backend)
        version = await agent_version(exe) if exe is not None else None
        backends.append(
            AgentBackendInfo(id=backend, available=exe is not None, version=version)
        )
    return AgentBackendsResponse(
        enabled=bool(request.app.state.agent_enabled), backends=backends
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
        goal=body.goal, symbol=body.symbol, strategies_dir=cfg.strategies_dir
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
