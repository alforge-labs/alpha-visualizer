"""/health レスポンスモデル (issue #399)"""
from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """稼働確認 + バージョン確認用のレスポンス。

    version はフッター表示・バグ報告時の確認に使う（UI から CLI に
    戻らずバージョンを確認できるようにする）。
    """

    status: str
    forge_dir: str
    version: str
