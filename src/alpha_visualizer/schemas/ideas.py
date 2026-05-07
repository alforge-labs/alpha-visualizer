"""ideas.json レスポンス用 Pydantic モデル。"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class Idea(BaseModel):
    """ideas.json の 1 アイデア。

    フィールドは ideas.json のキーをそのまま反映。未知フィールドは
    透過するため ``extra="allow"`` を設定（運用での互換性維持）。
    """

    model_config = ConfigDict(extra="allow")

    idea_id: str | None = None
    title: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    linked_strategies: list[str] | None = None
    created_at: str | None = None
    updated_at: str | None = None
