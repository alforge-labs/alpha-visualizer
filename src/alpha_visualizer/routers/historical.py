"""OHLC 時系列 API ルーター。

`/api/historical/{symbol}?interval=1d&start=&end=` を提供する。
HTTP 変換と DI のみを担当し、parquet 読み込みは ``services.historical`` に移譲する。
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.errors import InvalidRequestError, NotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.historical import HistoricalResponse
from alpha_visualizer.services import historical as historical_service

router = APIRouter()

# 許可する time interval の whitelist（path injection 防御の補助）。
# alpha-forge ``DataStore`` が出力する標準的な interval を網羅。
_INTERVAL_PATTERN = r"^(1m|2m|5m|15m|30m|60m|90m|1h|4h|1d|5d|1wk|1mo|3mo)$"


@router.get("/historical/{symbol}", response_model=HistoricalResponse)
async def get_historical(
    symbol: str,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    interval: str = Query(default="1d", pattern=_INTERVAL_PATTERN),
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
) -> dict[str, Any]:
    """指定 symbol × interval の OHLC ローソク足を返す。

    404: historical_dir 不在 or parquet ファイル不在
    400: symbol が不正、または start/end の形式不正
    """
    if not config.historical_dir.exists():
        raise NotFoundError(
            f"historical_dir が存在しません: {config.historical_dir}"
        )
    try:
        bars = historical_service.load_ohlc(
            config.historical_dir, symbol, interval, start=start, end=end
        )
    except FileNotFoundError as e:
        raise NotFoundError(
            f"OHLC データが見つかりません: symbol={symbol}, interval={interval}"
        ) from e
    except ValueError as e:
        raise InvalidRequestError(str(e)) from e

    return {"symbol": symbol, "interval": interval, "bars": bars}


__all__ = ["router"]
