"""アイデア API ルーター

`/api/ideas` と `/api/ideas/{idea_id}` を提供する。
ForgeConfig.ideas_json から JSON を直接読み取る。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from alpha_visualizer.forge_config import ForgeConfig

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_ideas(config: ForgeConfig) -> list[dict[str, Any]]:
    ideas_path = config.ideas_json
    if not ideas_path.exists():
        return []
    try:
        data = json.loads(ideas_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("ideas.json の読み込みに失敗: %s", e)
        return []
    if isinstance(data, list):
        return data
    # {"ideas": [...]} 形式にも対応
    if isinstance(data, dict):
        return data.get("ideas", [])
    return []


@router.get("/ideas")
async def list_ideas(
    request: Request,
    status: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    config: ForgeConfig = request.app.state.forge_config
    ideas = _load_ideas(config)
    if status is not None:
        ideas = [i for i in ideas if isinstance(i, dict) and i.get("status") == status]
    return ideas


@router.get("/ideas/{idea_id}")
async def get_idea(idea_id: str, request: Request) -> dict[str, Any]:
    config: ForgeConfig = request.app.state.forge_config
    ideas = _load_ideas(config)
    for idea in ideas:
        if isinstance(idea, dict) and idea.get("idea_id") == idea_id:
            return idea
    raise HTTPException(status_code=404, detail=f"idea_id '{idea_id}' が見つかりません")
