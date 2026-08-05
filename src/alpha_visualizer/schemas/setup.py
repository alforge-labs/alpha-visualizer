"""`/api/setup/status` のレスポンススキーマ（issue #492）。

セットアップの 5 チェック（cli / eula / workspace / auth / data）を集約する。
各チェックは 3 状態:

- ``ok``: 揃っている
- ``attention``: ユーザーの対応が必要（次の一手はフロント側が案内する）
- ``unknown``: 判定できなかった（CLI 呼び出しの失敗・timeout など。degraded）

``auth status`` の ``user_id`` はここに載せない（LAN 公開時に個人識別子が
API 経由で漏れるため）。パス類は ``mask_home`` 済みの文字列のみ許可。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

SetupCheckStatus = Literal["ok", "attention", "unknown"]


class CliCheck(BaseModel):
    """forge CLI の検出結果。version はおまけ情報（パース不能でも ok を保つ）。"""

    status: SetupCheckStatus
    version: str | None = None


class EulaCheck(BaseModel):
    """EULA 同意状態。GUI からは同意させない（CLI の対話に委ねる）。"""

    status: SetupCheckStatus


class WorkspaceCheck(BaseModel):
    """workspace（forge.yaml / FORGE_CONFIG）の解決状態。"""

    status: SetupCheckStatus
    #: 実際に読み込んだ forge.yaml の絶対パス（mask_home 済み）。未解決は None
    config_path: str | None = None


class AuthCheck(BaseModel):
    """認証状態。ローカル情報の表示のみ（GUI から auth login は起動しない）。"""

    status: SetupCheckStatus
    logged_in: bool | None = None
    plan_type: str | None = None


class DataCheck(BaseModel):
    """保有ヒストリカルデータの有無。"""

    status: SetupCheckStatus
    count: int | None = None


class SetupStatusResponse(BaseModel):
    #: 5 チェックすべてが ok
    ready: bool
    cli: CliCheck
    eula: EulaCheck
    workspace: WorkspaceCheck
    auth: AuthCheck
    data: DataCheck
