"""`/api/data` のレスポンススキーマ（issue #484）。

保有ヒストリカルデータの一覧は forge CLI（`data list --json`）に委譲し、
visualizer は鮮度（updated_at / stale）だけを付加する。CLI が返す
``file_path``（ローカル絶対パス）は実行環境情報の露出になるため
レスポンスに含めない。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class CreateDataJobRequest(BaseModel):
    """`POST /api/data/jobs` のリクエスト（issue #485）。

    値は forge CLI の argv にそのまま渡るため、境界でパターン検証して
    オプション注入・空白混入を塞ぐ（symbol 自体は build 側の ``--`` でも防護）。
    """

    model_config = ConfigDict(extra="ignore")

    action: Literal["fetch", "update"]
    #: fetch では必須。ティッカー形式（CL=F / 6758.T / BTC-USD / ^GSPC）を許容
    symbol: str | None = Field(
        default=None, min_length=1, pattern=r"^[A-Za-z0-9^.=-]+$"
    )
    #: 例: 1y / 5y / max。未指定は forge 既定
    period: str | None = Field(default=None, pattern=r"^[a-z0-9]+$")
    #: 例: 1d / 1h / 1wk。未指定は forge 既定
    interval: str | None = Field(default=None, pattern=r"^[a-z0-9]+$")

    @model_validator(mode="after")
    def _require_symbol_for_fetch(self) -> CreateDataJobRequest:
        if self.action == "fetch" and self.symbol is None:
            raise ValueError(
                "fetch には symbol が必要です / symbol is required for fetch"
            )
        return self
