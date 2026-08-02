"""AI 戦略開発（agent）API の Pydantic スキーマ。

OpenAPI 経由でフロント TS 型が自動生成される（ADR-0003）。変更したら
``cd frontend && pnpm run gen`` を忘れないこと。
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentBackendInfo(BaseModel):
    """エージェントバックエンド 1 件の検出結果。"""

    id: Literal["claude", "codex"]
    available: bool
    version: str | None


class AgentBackendsResponse(BaseModel):
    """検出結果と機能の有効状態。enabled=False は非 loopback 公開中。"""

    enabled: bool
    backends: list[AgentBackendInfo]


class CreateAgentJobRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    goal: str = Field(min_length=1, max_length=4000)
    # /api/jobs と同様、境界でシンボル形式を制限する（argv 素通し防止）
    symbol: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9=.^_-]+$"
    )
    backend: Literal["claude", "codex"]
