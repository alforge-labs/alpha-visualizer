"""WFO API レスポンス用 Pydantic モデル。

フィールド名は ``routers/wfo.py`` が実際に返す dict 構造に合わせている：

- ``WFOWindow``: ``_extract_windows`` の出力（id / label / is_*/oos_*）
- ``WFOResponse``: ``get_wfo`` の戻り値（windows + composite_equity / composite_dates）
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class WFOWindow(BaseModel):
    """1 ウィンドウの IS / OOS 評価値。

    ``pass`` キーは Python 予約語のため明示フィールドとして宣言できない。
    レスポンス互換性のため ``extra="allow"`` で透過的に保持する。
    """

    model_config = ConfigDict(extra="allow")

    id: int
    label: str = ""
    is_start: str = ""
    is_end: str = ""
    oos_start: str = ""
    oos_end: str = ""
    is_sharpe: float = 0.0
    oos_sharpe: float = 0.0
    is_return: float = 0.0
    oos_return: float = 0.0
    oos_is_ratio: float = 0.0
    params: dict[str, float] = {}


class WFOResponse(BaseModel):
    """``GET /api/wfo/{strategy_id}`` レスポンス。"""

    model_config = ConfigDict(extra="allow")

    strategy_id: str
    strategy_name: str = ""
    symbol: str = ""
    windows: list[WFOWindow] = []
    composite_equity: list[float] = []
    composite_dates: list[str] = []
