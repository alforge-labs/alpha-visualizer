"""``GET /api/versions`` のレスポンススキーマ。

3 コンポーネント（forge / visualizer / strike）の現在版・最新版を集約する。
各コンポーネントは 3 状態:

- ``ok``: 現在版が取得できた
- ``unknown``: 取得できなかった（CLI 未導入・timeout・未同期・PyPI 到達不可）
- ``disabled``: 対象外（strike で ``remote.enabled: false``）

``updatable`` は「GUI から更新できるか」。strike は常に False（稼働中の
発注サーバーを GUI から再起動させない）。visualizer は Windows で False。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

VersionComponentId = Literal["forge", "visualizer", "strike"]
VersionCheckStatus = Literal["ok", "unknown", "disabled"]


class ComponentVersion(BaseModel):
    id: VersionComponentId
    status: VersionCheckStatus
    current: str | None = None
    latest: str | None = None
    update_available: bool = False
    updatable: bool = False
    #: unknown / 更新不可の理由と次の一歩（curl 利用者向けの日英併記）
    message: str | None = None
    #: ``message`` に対応する機械可読コード（issue #358 と同じ方式）。
    #: サーバーの文言は curl 利用者向けに日英連結だが、UI は表示言語の文言だけを
    #: 出す。フロントは文字列のパターンマッチではなくこのコードで写像する
    code: str | None = None
    #: strike 専用。current が「いつ時点の値か」（最終同期時刻）。他は常に None
    as_of: str | None = None


class VersionsResponse(BaseModel):
    components: list[ComponentVersion]
