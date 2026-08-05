"""セットアップ状態 API ルーター（issue #492）。

``GET /api/setup/status`` — 「はじめる」画面（/start）のチェックリスト用に、
forge CLI 検出 / EULA / workspace / 認証 / データ有無を 1 レスポンスへ集約する。

設計の要点:

- CLI 呼び出しは並列（``asyncio.to_thread`` + ``gather``）。直列だと 1 つの
  timeout で画面表示が数十秒ブロックされる
- 個別の失敗はそのチェックだけ ``unknown``（degraded）にして 200 を維持する。
  初回セットアップ中はむしろ失敗が正常系（1 項目の失敗で全体 500 にしない）
- EULA は専用コマンドを持たない。``system paths --json`` を probe に使い、
  失敗が ``translate_forge_failure`` で EULA 定型文へ変換されたかで検知する
- workspace は visualizer 自身の ``ForgeConfig.config_path``（サブプロセスへ
  渡す ``FORGE_CONFIG`` の SSoT）が None かどうかで判定する。CLI の出力から
  再解釈すると、GUI ジョブと表示が別 workspace を向く事故を検知できない
"""
from __future__ import annotations

import asyncio
import re
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.setup import (
    AuthCheck,
    CliCheck,
    DataCheck,
    EulaCheck,
    SetupStatusResponse,
    WorkspaceCheck,
)
from alpha_visualizer.services.forge_cli import (
    FORGE_EULA_NOT_ACCEPTED_MESSAGE,
    mask_home,
    resolve_forge_exe,
)
from alpha_visualizer.services.forge_sync import run_forge_capture, run_forge_json

router = APIRouter()

#: 1 コマンドあたりの上限。status/paths/version は速いが、data list は
#: データセット数に比例して伸びるため data.py の LIST_TIMEOUT_SEC より短くしない
CHECK_TIMEOUT_SEC = 60

_VERSION_RE = re.compile(r"version\s+(\d[\w.\-]*)")

_T = TypeVar("_T")


def _parse_version(stdout: str) -> str | None:
    """``AlphaForge, version 1.3.0`` からバージョン番号だけを抜く。"""
    match = _VERSION_RE.search(stdout)
    return match.group(1) if match else None


async def _call_or_exc(func: Any, *args: Any) -> Any:
    """同期 CLI 呼び出しを別スレッドで実行し、例外は値として返す。

    gather(return_exceptions=True) と違い、呼び出し単位で捕捉するため
    「どの呼び出しが失敗したか」が位置で確定する。
    """
    try:
        return await asyncio.to_thread(func, *args)
    except Exception as exc:  # noqa: BLE001 — degraded 設計: 失敗は unknown に落とす
        return exc


def _is_eula_failure(result: Any) -> bool:
    return isinstance(result, Exception) and FORGE_EULA_NOT_ACCEPTED_MESSAGE in str(result)


@router.get("/setup/status", response_model=SetupStatusResponse)
async def get_setup_status(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> SetupStatusResponse:
    exe = resolve_forge_exe()
    if exe is None:
        # CLI が無ければ下流はすべて判定不能。サブプロセスは一切起動しない
        return SetupStatusResponse(
            ready=False,
            cli=CliCheck(status="attention"),
            eula=EulaCheck(status="unknown"),
            workspace=WorkspaceCheck(status="unknown"),
            auth=AuthCheck(status="unknown"),
            data=DataCheck(status="unknown"),
        )

    version_r, paths_r, auth_r, data_r = await asyncio.gather(
        _call_or_exc(run_forge_capture, ["--version"], forge_cfg, CHECK_TIMEOUT_SEC),
        _call_or_exc(run_forge_json, ["system", "paths", "--json"], forge_cfg, CHECK_TIMEOUT_SEC),
        _call_or_exc(
            run_forge_json, ["system", "auth", "status", "--json"], forge_cfg, CHECK_TIMEOUT_SEC
        ),
        _call_or_exc(run_forge_json, ["data", "list", "--json"], forge_cfg, CHECK_TIMEOUT_SEC),
    )

    # cli: 検出済み。version はおまけ（--version の失敗・パース不能でも ok を保つ）
    version = _parse_version(version_r) if isinstance(version_r, str) else None
    cli = CliCheck(status="ok", version=version)

    # eula: paths probe が成功すれば同意済み。EULA 定型文への変換で未同意を検知
    if not isinstance(paths_r, Exception):
        eula = EulaCheck(status="ok")
    elif _is_eula_failure(paths_r):
        eula = EulaCheck(status="attention")
    else:
        eula = EulaCheck(status="unknown")

    # workspace: FORGE_CONFIG の SSoT は visualizer 自身の config_path
    if forge_cfg.config_path is not None:
        workspace = WorkspaceCheck(
            status="ok" if eula.status == "ok" else "unknown",
            config_path=mask_home(str(forge_cfg.config_path)),
        )
    else:
        workspace = WorkspaceCheck(status="attention")

    # auth: user_id はレスポンスに載せない（プライバシー）
    if isinstance(auth_r, dict):
        logged_in = bool(auth_r.get("logged_in", False))
        dev_skip = bool(auth_r.get("dev_skip", False))
        plan_type = auth_r.get("plan_type")
        auth = AuthCheck(
            status="ok" if (logged_in or dev_skip) else "attention",
            logged_in=logged_in,
            plan_type=plan_type if isinstance(plan_type, str) else None,
        )
    else:
        auth = AuthCheck(status="unknown")

    # data: 0 件は「次はデータ取得」の attention
    if isinstance(data_r, dict):
        count = int(data_r.get("count", 0))
        data = DataCheck(status="ok" if count > 0 else "attention", count=count)
    else:
        data = DataCheck(status="unknown")

    ready = all(
        check.status == "ok" for check in (cli, eula, workspace, auth, data)
    )
    return SetupStatusResponse(
        ready=ready, cli=cli, eula=eula, workspace=workspace, auth=auth, data=data
    )
