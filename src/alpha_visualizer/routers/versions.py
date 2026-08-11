"""バージョン照会 API ルーター。

``GET /api/versions`` — alpha-forge / alpha-visualizer / alpha-strike の現在版と
最新版を 1 レスポンスへ集約する（メンテナンス画面のバージョンセクション用）。

設計の要点:

- 照会は並列（``asyncio.gather``）。直列だと 1 つの timeout で画面表示が
  数十秒ブロックされる
- 個別の失敗はそのコンポーネントだけ ``unknown`` にして 200 を維持する。
  初回セットアップ中やオフラインではむしろ失敗が正常系
- forge の最新版判定は ``self version --json`` の結果をそのまま採用する。
  GitHub Releases の照会先・dev build 判定を visualizer 側に再実装すると、
  forge のリリース方式が変わったときに 2 か所がずれる
- strike は SSH で取りに行かない。同期済み ``_meta.json`` を読む。
  oracle-strike への SSH は Cloudflare Access 経由で、セッション切れ時に
  cloudflared がブラウザを開いて認証を要求するため、画面表示のたびに
  ブラウザが開いてしまう（設計 §3）

設計: docs/superpowers/specs/2026-08-10-tool-versions-design.md
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import sys
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from alpha_visualizer import __version__
from alpha_visualizer.concurrency import call_or_exc
from alpha_visualizer.dependencies import get_forge_config_dep, get_job_manager
from alpha_visualizer.errors import (
    ConflictError,
    ForgeCliNotFoundError,
    InvalidRequestError,
    LocalWriteDisabledError,
)
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers.jobs import JobSummary, _to_summary
from alpha_visualizer.schemas.versions import ComponentVersion, VersionsResponse
from alpha_visualizer.services.forge_cli import (
    FORGE_EULA_NOT_ACCEPTED_MESSAGE,
    FORGE_NOT_FOUND_MESSAGE,
    resolve_forge_exe,
)
from alpha_visualizer.services.forge_sync import run_forge_json
from alpha_visualizer.services.jobs import JobManager
from alpha_visualizer.services.pypi import fetch_latest_version, is_newer
from alpha_visualizer.services.self_update import (
    NO_INSTALLER_MESSAGE,
    build_upgrade_argv,
    is_editable_install,
)

router = APIRouter()

#: forge CLI 1 呼び出しの上限。self version は GitHub Releases を見るため
#: ネットワーク待ちが乗る
FORGE_TIMEOUT_SEC = 60

#: alpha-strike が起動時に events ディレクトリへ書き、sync-events の rsync で
#: 降りてくるメタファイル。`.jsonl` ではないためイベント走査には混ざらない
STRIKE_META_FILENAME = "_meta.json"

VISUALIZER_PACKAGE = "alpha-visualizer"
STRIKE_PACKAGE = "alpha-strike"

FORGE_UNKNOWN_MESSAGE = (
    "alpha-forge のバージョンを取得できませんでした（未導入または実行に失敗）"
    " / Could not read the alpha-forge version (not installed, or the command failed)"
)

STRIKE_NOT_SYNCED_MESSAGE = (
    "`alpha-forge live sync-events` を実行すると alpha-strike のバージョンが表示されます"
    " / Run `alpha-forge live sync-events` to show the alpha-strike version"
)

#: ``ComponentVersion.code``。UI はこの値で表示言語の文言へ写像する
FORGE_UNKNOWN_CODE = "forge_version_unknown"
FORGE_EULA_NOT_ACCEPTED_CODE = "forge_eula_not_accepted"
STRIKE_NOT_SYNCED_CODE = "strike_not_synced"
WINDOWS_MANUAL_UPDATE_CODE = "windows_manual_update"

WINDOWS_MANUAL_UPDATE_MESSAGE = (
    "Windows では実行中のプロセスを置き換えられないため、"
    "`pip install -U alpha-visualizer` を実行してから再起動してください"
    " / On Windows the running process cannot be replaced."
    " Run `pip install -U alpha-visualizer`, then restart."
)

LOCAL_WRITE_DISABLED_MESSAGE = (
    "ツールの更新は localhost でのみ実行できます（LAN 公開中は無効）"
    " / Tool updates are only available on localhost"
)

STRIKE_NOT_UPDATABLE_MESSAGE = (
    "alpha-strike は GUI から更新できません（稼働中の発注サーバーを再起動しないため）。"
    "VM 上で更新手順を実行してください"
    " / alpha-strike cannot be updated from the GUI."
    " Run the update procedure on the VM."
)

EDITABLE_INSTALL_MESSAGE = (
    "開発用（editable）インストールのため GUI からは更新できません。"
    "作業ツリーで git pull / uv sync を実行してください"
    " / This is an editable install; updating from the GUI is disabled."
    " Run git pull / uv sync in your working tree."
)

JOBS_RUNNING_MESSAGE = (
    "実行中のジョブがあるため更新できません。完了またはキャンセルしてから再試行してください"
    " / Cannot update while jobs are running. Wait for them to finish or cancel them."
)

#: 更新ジョブの終了を待つ上限。pip の依存解決が遅い環境でも足りる長さにし、
#: これを超えたら再起動を諦める（フラグを立てたまま放置しない）
RESTART_WATCH_TIMEOUT_SEC = 1800


async def _restart_after_success(app: Any, manager: JobManager, job_id: str) -> None:
    """更新ジョブが成功したときだけ再起動を要求する。

    失敗したまま再起動すると、壊れた環境で二度と起動しない事態になりうる。
    再起動は成功パスにのみ紐づける（設計 §エラー処理の最重要行）。

    ``restart_requested`` は ``should_exit`` を実際に立てられたときだけ立てる。
    server が None の経路（``alpha-vis serve`` 以外での起動）でフラグだけが
    立って誰も再起動を実行しない状態を残さないため。
    """
    try:
        record = await manager.wait_terminal(job_id, timeout=RESTART_WATCH_TIMEOUT_SEC)
    except TimeoutError:
        return
    if record.status != "succeeded":
        return
    server = app.state.uvicorn_server
    if server is not None:
        server.should_exit = True
        app.state.restart_requested = True


def _read_strike_meta(events_dir: pathlib.Path) -> dict[str, Any] | None:
    """同期済み ``_meta.json`` を読む。不在・破損は None。"""
    path = events_dir / STRIKE_META_FILENAME
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def _forge_unknown(message: str, code: str) -> ComponentVersion:
    return ComponentVersion(
        id="forge", status="unknown", updatable=False, message=message, code=code
    )


def _forge_component(result: dict[str, Any] | Exception | None) -> ComponentVersion:
    """``self version --json`` の結果（または失敗）から forge 行を組み立てる。

    失敗を一律で「未導入または実行に失敗」に丸めない。EULA は改訂のたびに
    再同意が必要で、``self update`` 直後に必ず通る経路であり、まさにこの画面が
    次の一歩を案内すべき場面だからである。``run_forge_capture`` が
    ``translate_forge_failure`` で変換済みの案内をそのまま利用者へ渡す
    （``routers/setup.py`` が eula: attention を出し分けているのと同じ判定）。
    """
    if isinstance(result, Exception):
        if FORGE_EULA_NOT_ACCEPTED_MESSAGE in str(result):
            return _forge_unknown(
                FORGE_EULA_NOT_ACCEPTED_MESSAGE, FORGE_EULA_NOT_ACCEPTED_CODE
            )
        return _forge_unknown(FORGE_UNKNOWN_MESSAGE, FORGE_UNKNOWN_CODE)
    payload = result
    if payload is None:
        return _forge_unknown(FORGE_UNKNOWN_MESSAGE, FORGE_UNKNOWN_CODE)
    current = payload.get("current_version")
    if not isinstance(current, str):
        return _forge_unknown(FORGE_UNKNOWN_MESSAGE, FORGE_UNKNOWN_CODE)
    latest = payload.get("latest_version")
    return ComponentVersion(
        id="forge",
        status="ok",
        current=current,
        latest=latest if isinstance(latest, str) else None,
        update_available=bool(payload.get("update_available", False)),
        updatable=True,
    )


def _visualizer_component(latest: str | None) -> ComponentVersion:
    updatable = sys.platform != "win32"
    update_available = bool(latest and is_newer(latest, __version__))
    return ComponentVersion(
        id="visualizer",
        status="ok",
        current=__version__,
        latest=latest,
        update_available=update_available,
        updatable=updatable,
        # 更新が無いのに Windows 向けの手動更新案内を出すと、最新版のユーザーにも
        # 「やるべき作業がある」ように見えてしまう。案内は更新があるときだけ出す
        message=WINDOWS_MANUAL_UPDATE_MESSAGE if (not updatable and update_available) else None,
        code=WINDOWS_MANUAL_UPDATE_CODE if (not updatable and update_available) else None,
    )


def _strike_component(
    forge_cfg: ForgeConfig, meta: dict[str, Any] | None, latest: str | None
) -> ComponentVersion:
    if not forge_cfg.remote_enabled:
        return ComponentVersion(id="strike", status="disabled", updatable=False)
    current = meta.get("version") if meta is not None else None
    if not isinstance(current, str):
        return ComponentVersion(
            id="strike",
            status="unknown",
            latest=latest,
            updatable=False,
            message=STRIKE_NOT_SYNCED_MESSAGE,
            code=STRIKE_NOT_SYNCED_CODE,
        )
    as_of = meta.get("started_at") if meta is not None else None
    return ComponentVersion(
        id="strike",
        status="ok",
        current=current,
        latest=latest,
        update_available=bool(latest and is_newer(latest, current)),
        # 稼働中の発注サーバーを GUI から更新・再起動させない（設計 非ゴール）
        updatable=False,
        as_of=as_of if isinstance(as_of, str) else None,
    )


@router.get("/versions", response_model=VersionsResponse)
async def get_versions(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> VersionsResponse:
    forge_r, vis_latest_r, strike_latest_r, strike_meta_r = await asyncio.gather(
        call_or_exc(run_forge_json, ["self", "version", "--json"], forge_cfg, FORGE_TIMEOUT_SEC),
        call_or_exc(fetch_latest_version, VISUALIZER_PACKAGE),
        call_or_exc(fetch_latest_version, STRIKE_PACKAGE),
        call_or_exc(_read_strike_meta, forge_cfg.live_events_dir),
    )
    # 例外は degraded 設計により「値が取れなかった」と同義に畳み込む。
    # 各 _*_component は None を「unknown へ落とす」契約で既に扱えるため、
    # ここで型を絞り込むだけで済む（2 重の分岐を増やさない）。
    # forge だけは例外をそのまま渡す。EULA 未同意など「次の一歩がある失敗」を
    # ここで None へ畳むと、_forge_component が理由を区別できなくなる
    forge_result = forge_r if isinstance(forge_r, (dict, Exception)) else None
    vis_latest = vis_latest_r if isinstance(vis_latest_r, str) else None
    strike_latest = strike_latest_r if isinstance(strike_latest_r, str) else None
    strike_meta = strike_meta_r if isinstance(strike_meta_r, dict) else None
    return VersionsResponse(
        components=[
            _forge_component(forge_result),
            _visualizer_component(vis_latest),
            _strike_component(forge_cfg, strike_meta, strike_latest),
        ]
    )


@router.post("/versions/forge/update", response_model=JobSummary, status_code=202)
async def update_forge(
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """``alpha-forge self update --yes`` をジョブとして起動する。

    ゲートは既存の ``local_write_enabled`` を再利用する（routers/data.py・
    routers/pine.py と同じ方針）。パッケージ更新は「書き込み系ローカル限定
    機能」そのもので、新しいフラグを足す理由がない。
    """
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)
    # ジョブを積んでから失敗させず、起動前に fail-fast する（routers/live.py と同じ）
    if resolve_forge_exe() is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)
    record = await manager.create(kind="forge_self_update", strategy_id="", symbol="")
    return _to_summary(record)


@router.post("/versions/strike/update")
async def update_strike() -> None:
    """alpha-strike は GUI から更新しない（明示的に 400 で断る）。

    ルート自体を生やさず 404 にすると「まだ実装されていないのか、
    意図的に無いのか」がクライアントから区別できない。
    """
    raise InvalidRequestError(STRIKE_NOT_UPDATABLE_MESSAGE)


def _has_active_jobs(manager: JobManager) -> bool:
    """queued / running のジョブが 1 件でもあるか。

    自己更新は自プロセスを差し替えて再起動するため、走っているジョブは
    すべて道連れになる。バックテストやエージェントの実行中は更新を断る。
    """
    return any(record.status in ("queued", "running") for record in manager.list())


@router.post("/versions/visualizer/update", response_model=JobSummary, status_code=202)
async def update_visualizer(
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """自分自身を pip / uv で更新するジョブを起動する。

    実行中プロセスを差し替えるため、事前ガードを 4 つ通す。1 つでも欠けたら
    ジョブを積まずに 409 で断る（積んでから失敗させると、原因がログの奥に
    埋まったうえに中途半端な状態が残りうる）。
    """
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)
    if sys.platform == "win32":
        # 実行中の alpha-vis.exe がロックされ、pip がファイルを置換できない
        raise ConflictError(WINDOWS_MANUAL_UPDATE_MESSAGE)
    if is_editable_install():
        raise ConflictError(EDITABLE_INSTALL_MESSAGE)
    if _has_active_jobs(manager):
        raise ConflictError(JOBS_RUNNING_MESSAGE)
    if build_upgrade_argv() is None:
        raise ConflictError(NO_INSTALLER_MESSAGE)
    record = await manager.create(kind="visualizer_self_update", strategy_id="", symbol="")
    # 成功監視はレスポンスを待たせない（更新は数分かかりうる）。
    # 参照を app.state に持たせないと、実行中のタスクが GC で消えうる
    request.app.state.restart_watcher = asyncio.create_task(
        _restart_after_success(request.app, manager, record.job_id)
    )
    return _to_summary(record)


__all__ = ["router"]
