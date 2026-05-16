"""historical OHLC parquet を読み込んで JSON-serializable な dict list に変換する。

`alpha-forge` の `DataStore` が出力する ``{symbol}_{interval}.parquet``
(カラム: Open / High / Low / Close / Volume + DatetimeIndex) を読む。
"""

from __future__ import annotations

import math
import pathlib
from typing import Any

import pandas as pd

_UNSAFE_SUBSTRS = ("/", "\\", "..", "\x00")


def _validate_symbol(symbol: str) -> None:
    """symbol にパスインジェクション系の文字が含まれていないか検証する。"""
    if not symbol or symbol.strip() == "":
        raise ValueError("symbol が空です")
    for bad in _UNSAFE_SUBSTRS:
        if bad in symbol:
            raise ValueError(
                f"symbol に使用できない文字が含まれています: {symbol!r}"
            )


def _resolve_parquet_path(
    historical_dir: pathlib.Path, symbol: str, interval: str
) -> pathlib.Path:
    """``historical_dir / {symbol}_{interval}.parquet`` を解決し、
    historical_dir 配下に収まることを二重ガードする (CWE-22)。"""
    candidate = (historical_dir / f"{symbol}_{interval}.parquet").resolve()
    base = historical_dir.resolve()
    try:
        candidate.relative_to(base)
    except ValueError as e:
        raise ValueError(
            f"解決後のパスが historical_dir 外を指しています: {candidate}"
        ) from e
    return candidate


def _format_time(ts: pd.Timestamp) -> str:
    """DatetimeIndex の要素を ISO 8601 文字列に変換する。

    日付情報のみの場合（時刻が 00:00:00）は ``YYYY-MM-DD`` を返す。
    時刻情報がある場合は ``YYYY-MM-DDTHH:MM:SS`` を返す。
    """
    if ts.hour == 0 and ts.minute == 0 and ts.second == 0:
        return ts.strftime("%Y-%m-%d")
    return ts.strftime("%Y-%m-%dT%H:%M:%S")


def _none_if_nan(value: Any) -> Any:
    """NaN を None に変換する（JSON シリアライズ用）。"""
    if isinstance(value, float) and math.isnan(value):
        return None
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        # pd.isna は配列入力や独自型に対しては TypeError/ValueError を投げる。
        # その場合は NaN テスト不能なので元の値をそのまま返して呼び出し側に委ねる。
        # (CodeQL #43: empty-except の説明コメント要件を満たす)
        pass
    return value


def load_ohlc(
    historical_dir: pathlib.Path,
    symbol: str,
    interval: str,
    start: str | None = None,
    end: str | None = None,
) -> list[dict[str, Any]]:
    """historical parquet を読んで OHLC dict list を返す。

    Args:
        historical_dir: forge.yaml ``data.storage_path`` で解決済みのディレクトリ。
        symbol: 銘柄シンボル（ファイル名に使用、`/` `..` は許可しない）。
        interval: 時間足（例: "1d", "1h"）。ファイル名に使用される。
        start: ISO 8601 日付/日時。指定すると `>= start` で slice。
        end: ISO 8601 日付/日時。指定すると `<= end` で slice。

    Returns:
        ``[{time, open, high, low, close, volume}, ...]`` の dict 配列。
        TradingView lightweight-charts の ``setData()`` 互換。

    Raises:
        ValueError: symbol が無効、または日付指定が parse できない。
        FileNotFoundError: 対象 parquet が存在しない。
    """
    _validate_symbol(symbol)
    _validate_symbol(interval)  # interval にも同じ規則を適用

    path = _resolve_parquet_path(historical_dir, symbol, interval)
    if not path.is_file():
        raise FileNotFoundError(
            f"OHLC parquet が見つかりません: {path.name}"
        )

    df = pd.read_parquet(path)

    if start is not None or end is not None:
        if not isinstance(df.index, pd.DatetimeIndex):
            # store.load() のメタによっては index が name='Date' の通常 Index になる場合
            df.index = pd.to_datetime(df.index, errors="coerce")
        try:
            start_ts = pd.Timestamp(start) if start else None
            end_ts = pd.Timestamp(end) if end else None
        except Exception as e:
            raise ValueError(f"start/end の日付形式が不正です: {e}") from e
        if start_ts is not None:
            df = df.loc[df.index >= start_ts]
        if end_ts is not None:
            df = df.loc[df.index <= end_ts]

    # カラム名を小文字に正規化（alpha-forge は Open/High/Low/Close/Volume）。
    rename_map: dict[str, str] = {}
    for canonical in ("Open", "High", "Low", "Close", "Volume"):
        if canonical in df.columns:
            rename_map[canonical] = canonical.lower()
    if rename_map:
        df = df.rename(columns=rename_map)

    bars: list[dict[str, Any]] = []
    has_volume = "volume" in df.columns
    for ts, row in df.iterrows():
        if not isinstance(ts, pd.Timestamp):
            ts = pd.Timestamp(ts)
        bar: dict[str, Any] = {
            "time": _format_time(ts),
            "open": _none_if_nan(float(row["open"])) if "open" in df.columns else None,
            "high": _none_if_nan(float(row["high"])) if "high" in df.columns else None,
            "low": _none_if_nan(float(row["low"])) if "low" in df.columns else None,
            "close": _none_if_nan(float(row["close"])) if "close" in df.columns else None,
        }
        if has_volume:
            volume_val = row["volume"]
            bar["volume"] = _none_if_nan(float(volume_val)) if pd.notna(volume_val) else None
        else:
            bar["volume"] = None
        bars.append(bar)
    return bars
