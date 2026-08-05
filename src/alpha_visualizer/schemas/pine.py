"""`/api/pine` のレスポンススキーマ（issue #487）。"""

from __future__ import annotations

from pydantic import BaseModel


class PineScriptResponse(BaseModel):
    """生成された Pine Script。

    ``script`` は `alpha-forge pine preview` の stdout（Pine v6 本文）そのもの。
    ``filename`` はダウンロード時の推奨ファイル名（CLI の `pine generate` が
    書き出すファイル名と同じ規約）。
    """

    strategy_id: str
    filename: str
    script: str
