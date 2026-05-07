"""ideas.json を読む Reader。

DB を使わないので Repository ではなく Reader と命名。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class IdeasReader:
    """`ideas.json` を読み取る薄いラッパー。"""

    def __init__(self, ideas_json_path: Path) -> None:
        self._path = ideas_json_path

    def read(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            return []
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("ideas.json 読み込み失敗: %s", exc)
            return []
        if isinstance(data, list):
            return [d for d in data if isinstance(d, dict)]
        if isinstance(data, dict):
            ideas = data.get("ideas", [])
            return [d for d in ideas if isinstance(d, dict)]
        return []
