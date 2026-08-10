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

from fastapi import APIRouter, Depends

from alpha_visualizer import __version__
from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.versions import ComponentVersion, VersionsResponse
from alpha_visualizer.services.forge_sync import run_forge_json
from alpha_visualizer.services.pypi import fetch_latest_version, is_newer

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

WINDOWS_MANUAL_UPDATE_MESSAGE = (
    "Windows では実行中のプロセスを置き換えられないため、"
    "`pip install -U alpha-visualizer` を実行してから再起動してください"
    " / On Windows the running process cannot be replaced."
    " Run `pip install -U alpha-visualizer`, then restart."
)


async def _call_or_exc(func: Any, *args: Any) -> Any:
    """同期呼び出しを別スレッドで実行し、例外は値として返す（degraded 設計）。

    ``asyncio.gather`` に渡す 4 つの呼び出しをすべてこのヘルパで統一して包むことで、
    forge / PyPI（visualizer・strike）/ strike メタ読み取りのどれか 1 つが想定外の
    例外を送出しても、gather 全体が例外伝播で落ちて他 2 つを巻き込むことがない
    （``routers/setup.py`` の同名ヘルパと同じ思想）。
    """
    try:
        return await asyncio.to_thread(func, *args)
    except Exception as exc:  # noqa: BLE001 — degraded 設計: 失敗は unknown に落とす
        return exc


def _read_strike_meta(events_dir: pathlib.Path) -> dict[str, Any] | None:
    """同期済み ``_meta.json`` を読む。不在・破損は None。"""
    path = events_dir / STRIKE_META_FILENAME
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def _forge_component(payload: dict[str, Any] | None) -> ComponentVersion:
    if payload is None:
        return ComponentVersion(
            id="forge", status="unknown", updatable=False, message=FORGE_UNKNOWN_MESSAGE
        )
    current = payload.get("current_version")
    if not isinstance(current, str):
        return ComponentVersion(
            id="forge", status="unknown", updatable=False, message=FORGE_UNKNOWN_MESSAGE
        )
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
    return ComponentVersion(
        id="visualizer",
        status="ok",
        current=__version__,
        latest=latest,
        update_available=bool(latest and is_newer(latest, __version__)),
        updatable=updatable,
        message=None if updatable else WINDOWS_MANUAL_UPDATE_MESSAGE,
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
        _call_or_exc(
            run_forge_json, ["self", "version", "--json"], forge_cfg, FORGE_TIMEOUT_SEC
        ),
        _call_or_exc(fetch_latest_version, VISUALIZER_PACKAGE),
        _call_or_exc(fetch_latest_version, STRIKE_PACKAGE),
        _call_or_exc(_read_strike_meta, forge_cfg.live_events_dir),
    )
    # 例外は degraded 設計により「値が取れなかった」と同義に畳み込む。
    # 各 _*_component は None を「unknown へ落とす」契約で既に扱えるため、
    # ここで型を絞り込むだけで済む（2 重の分岐を増やさない）。
    forge_payload = forge_r if isinstance(forge_r, dict) else None
    vis_latest = vis_latest_r if isinstance(vis_latest_r, str) else None
    strike_latest = strike_latest_r if isinstance(strike_latest_r, str) else None
    strike_meta = strike_meta_r if isinstance(strike_meta_r, dict) else None
    return VersionsResponse(
        components=[
            _forge_component(forge_payload),
            _visualizer_component(vis_latest),
            _strike_component(forge_cfg, strike_meta, strike_latest),
        ]
    )


__all__ = ["router"]
