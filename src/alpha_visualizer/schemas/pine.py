"""`/api/pine` のレスポンススキーマ（issue #487）。"""

from __future__ import annotations

from pydantic import BaseModel


class PineIndicatorSupport(BaseModel):
    """戦略が使う指標 1 件の Pine 対応状況（issue #488）。"""

    id: str
    type: str
    pine_supported: bool


class PineSupportResponse(BaseModel):
    """生成前の非対応指標チェック結果（issue #488）。

    対応表の SSoT は forge 側（`analyze indicator list --json`）。
    ``unsupported_types`` は重複を除いた昇順。``all_unsupported`` は指標を
    1 つ以上持ち、そのすべてが Pine 非対応（= 生成しても TradingView で
    機能しない可能性が高い）ことを示す。
    """

    strategy_id: str
    indicators: list[PineIndicatorSupport]
    unsupported_types: list[str]
    all_unsupported: bool


class PineScriptResponse(BaseModel):
    """生成された Pine Script。

    ``script`` は `alpha-forge pine preview` の stdout（Pine v6 本文）そのもの。
    ``filename`` はダウンロード時の推奨ファイル名（CLI の `pine generate` が
    書き出すファイル名と同じ規約）。
    """

    strategy_id: str
    filename: str
    script: str
