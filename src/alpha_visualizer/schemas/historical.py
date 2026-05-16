"""OHLC 時系列 API のレスポンススキーマ。

`/api/historical/{symbol}` が返す candlestick データの形式を定義する。
`bars` は TradingView lightweight-charts の `series.setData()` 互換 shape
(`{time, open, high, low, close, volume}` の配列) として設計されている。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class OhlcBar(BaseModel):
    """1 本のローソク足 (open / high / low / close + volume)。

    `time` は ISO 8601 文字列（日足は ``YYYY-MM-DD``、intraday は
    ``YYYY-MM-DDTHH:MM:SS``）。`volume` は無いカラムの parquet では None。
    """

    model_config = ConfigDict(extra="allow")

    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class HistoricalResponse(BaseModel):
    """OHLC 時系列のレスポンスエンベロープ。

    `bars` 配列に加えて symbol / interval を返すことで、フロント側で
    複数 symbol のキャッシュを取り違えないよう識別子を付与する。
    """

    model_config = ConfigDict(extra="allow")

    symbol: str
    interval: str
    bars: list[OhlcBar]
