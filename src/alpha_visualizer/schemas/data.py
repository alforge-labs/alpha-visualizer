"""`/api/data` のレスポンススキーマ（issue #484）。

保有ヒストリカルデータの一覧は forge CLI（`data list --json`）に委譲し、
visualizer は鮮度（updated_at / stale）だけを付加する。CLI が返す
``file_path``（ローカル絶対パス）は実行環境情報の露出になるため
レスポンスに含めない。
"""

from __future__ import annotations

from pydantic import BaseModel


class DataSetItem(BaseModel):
    """保有データ 1 件。forge CLI の `--json` の `datasets[]` に鮮度を付加した形。"""

    symbol: str
    interval: str
    #: 期間端。取得失敗した parquet では CLI が "N/A" / "Error" を返すため文字列
    start: str
    end: str
    rows: int
    size_bytes: int
    #: parquet の mtime（ISO 8601・UTC）。ファイル不在・stat 失敗時は None
    updated_at: str | None = None
    #: 最終更新から TTL（24h）超過。鮮度を判定できないときは None
    stale: bool | None = None


class DataListResponse(BaseModel):
    datasets: list[DataSetItem]
    count: int
