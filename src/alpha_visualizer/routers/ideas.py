"""アイデア API ルーター

`/api/ideas` と `/api/ideas/{idea_id}` を提供する。
``IdeasReader`` 経由で `ideas.json` を読み取る。
"""
from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from alpha_visualizer.dependencies import get_ideas_reader
from alpha_visualizer.errors import NotFoundError
from alpha_visualizer.repositories.ideas import IdeasReader
from alpha_visualizer.schemas.ideas import Idea

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/ideas", response_model=list[Idea])
async def list_ideas(
    reader: Annotated[IdeasReader, Depends(get_ideas_reader)],
    status: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    ideas = reader.read()
    if status is not None:
        ideas = [i for i in ideas if i.get("status") == status]
    return ideas


@router.get("/ideas/{idea_id}", response_model=Idea)
async def get_idea(
    idea_id: str,
    reader: Annotated[IdeasReader, Depends(get_ideas_reader)],
) -> dict[str, Any]:
    for idea in reader.read():
        if idea.get("idea_id") == idea_id:
            return idea
    raise NotFoundError(f"idea_id '{idea_id}' が見つかりません")
