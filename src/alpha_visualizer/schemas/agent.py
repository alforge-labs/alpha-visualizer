"""AI 戦略開発（agent）API の Pydantic スキーマ。

OpenAPI 経由でフロント TS 型が自動生成される（ADR-0003）。変更したら
``cd frontend && pnpm run gen`` を忘れないこと。
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from alpha_visualizer.services.agent_cli import (
    DEFAULT_CLAUDE_MAX_TURNS,
    MAX_CLAUDE_MAX_TURNS,
)


class AgentBackendInfo(BaseModel):
    """エージェントバックエンド 1 件の検出結果。"""

    id: Literal["claude", "codex"]
    available: bool
    version: str | None


class AgentBackendsResponse(BaseModel):
    """検出結果と機能の有効状態。enabled=False は非 loopback 公開中。"""

    enabled: bool
    backends: list[AgentBackendInfo]
    # サーバー側で有効なターン上限の既定値。GUI が入力欄のプレースホルダに
    # 使い、既定値をフロントに二重定義しないための情報（claude のみ有効）
    default_max_turns: int = DEFAULT_CLAUDE_MAX_TURNS
    max_max_turns: int = MAX_CLAUDE_MAX_TURNS


class CreateAgentJobRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    goal: str = Field(min_length=1, max_length=4000)
    # /api/jobs と同様、境界でシンボル形式を制限する（argv 素通し防止）
    symbol: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9=.^_-]+$"
    )
    backend: Literal["claude", "codex"]
    # ターン上限の明示指定（claude のみ有効。未指定はサーバー既定）。
    # 上限を設けるのは、暴走時の課金が青天井にならないようにするため
    max_turns: int | None = Field(default=None, ge=1, le=MAX_CLAUDE_MAX_TURNS)
    # 派生開発（issue #491）: 指定すると既存戦略を起点に改善指示（goal）を
    # 適用した新規 id の派生版を作る。id 規約は /api/jobs の strategy_id と同じ
    base_strategy_id: str | None = Field(
        default=None, min_length=1, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$"
    )
