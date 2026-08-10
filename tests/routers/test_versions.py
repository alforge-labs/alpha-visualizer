"""GET /api/versions のテスト。

設計の要点:

- 3 コンポーネント（forge / visualizer / strike）を 1 レスポンスに集約
- 個別の照会失敗はそのコンポーネントだけ unknown にして 200 を維持する。
  1 つの失敗が他 2 つを巻き込まないことがこの設計の存在理由である
- strike は remote.enabled=false なら disabled、未同期なら unknown
- forge の latest 判定は forge 自身（self version --json）の結果をそのまま使う

forge 呼び出しは `routers.versions` 名前空間の `run_forge_json` を patch する
（実 PATH を見ると CLI の無い CI で結果が実行マシン依存になる）。
"""
from __future__ import annotations

import json
import pathlib
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer import __version__
from alpha_visualizer.app import create_app
from alpha_visualizer.errors import ExternalProcessError

FORGE_SELF_VERSION = {
    "current_version": "1.9.2",
    "latest_version": "1.9.3",
    "latest_url": "https://example.invalid/releases/v1.9.3",
    "update_available": True,
    "is_dev_build": False,
    "error": None,
}


def _components(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in payload["components"]}


@pytest.fixture()
def remote_workspace(tmp_path: pathlib.Path) -> pathlib.Path:
    """remote.enabled=true の workspace（strike を照会対象にする）。"""
    (tmp_path / "forge.yaml").write_text(
        "remote:\n"
        "  enabled: true\n"
        '  local_events_path: "./data/live/events"\n',
        encoding="utf-8",
    )
    return tmp_path


def _write_strike_meta(root: pathlib.Path, payload: dict[str, Any]) -> None:
    events = root / "data" / "live" / "events"
    events.mkdir(parents=True, exist_ok=True)
    (events / "_meta.json").write_text(json.dumps(payload), encoding="utf-8")


def test_3コンポーネントが揃って返る(remote_workspace: pathlib.Path) -> None:
    _write_strike_meta(
        remote_workspace,
        {"component": "alpha-strike", "version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"},
    )
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version",
            side_effect=lambda pkg: {"alpha-visualizer": "9.9.9", "alpha-strike": "1.0.5"}[pkg],
        ),
    ):
        res = client.get("/api/versions")
    assert res.status_code == 200
    comps = _components(res.json())

    assert comps["forge"]["status"] == "ok"
    assert comps["forge"]["current"] == "1.9.2"
    assert comps["forge"]["latest"] == "1.9.3"
    assert comps["forge"]["update_available"] is True

    assert comps["visualizer"]["current"] == __version__
    assert comps["visualizer"]["latest"] == "9.9.9"
    assert comps["visualizer"]["update_available"] is True

    assert comps["strike"]["status"] == "ok"
    assert comps["strike"]["current"] == "1.0.4"
    assert comps["strike"]["update_available"] is True
    assert comps["strike"]["updatable"] is False
    assert comps["strike"]["as_of"] == "2026-08-10T09:12:00+09:00"


def test_forgeの失敗は他2つを巻き込まない(remote_workspace: pathlib.Path) -> None:
    """degraded 設計の核。forge が落ちても visualizer / strike は ok のまま。"""
    _write_strike_meta(remote_workspace, {"version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"})
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            side_effect=ExternalProcessError("forge が異常終了しました"),
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version",
            side_effect=lambda pkg: {"alpha-visualizer": "9.9.9", "alpha-strike": "1.0.5"}[pkg],
        ),
    ):
        res = client.get("/api/versions")
    assert res.status_code == 200
    comps = _components(res.json())
    assert comps["forge"]["status"] == "unknown"
    assert comps["forge"]["current"] is None
    assert comps["visualizer"]["status"] == "ok"
    assert comps["strike"]["status"] == "ok"


def test_PyPI取得失敗でもcurrentは維持される(remote_workspace: pathlib.Path) -> None:
    _write_strike_meta(remote_workspace, {"version": "1.0.4", "started_at": None})
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value=None
        ),
    ):
        res = client.get("/api/versions")
    comps = _components(res.json())
    assert comps["visualizer"]["status"] == "ok"
    assert comps["visualizer"]["current"] == __version__
    assert comps["visualizer"]["latest"] is None
    assert comps["visualizer"]["update_available"] is False


def test_meta未同期のstrikeはunknownで案内を出す(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="1.0.5"
        ),
    ):
        res = client.get("/api/versions")
    strike = _components(res.json())["strike"]
    assert strike["status"] == "unknown"
    assert strike["current"] is None
    assert "sync-events" in (strike["message"] or "")


def test_meta破損時もunknownに落ちる(remote_workspace: pathlib.Path) -> None:
    events = remote_workspace / "data" / "live" / "events"
    events.mkdir(parents=True)
    (events / "_meta.json").write_text("{ broken", encoding="utf-8")
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="1.0.5"
        ),
    ):
        res = client.get("/api/versions")
    assert _components(res.json())["strike"]["status"] == "unknown"


def test_remote無効ならstrikeはdisabled(tmp_path: pathlib.Path) -> None:
    (tmp_path / "forge.yaml").write_text("{}\n", encoding="utf-8")
    client = TestClient(create_app(forge_dir=tmp_path))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value=None
        ),
    ):
        res = client.get("/api/versions")
    assert _components(res.json())["strike"]["status"] == "disabled"


def test_Windowsではvisualizerがupdatable_false(remote_workspace: pathlib.Path) -> None:
    """実行中の alpha-vis.exe をロックしたまま pip が置換できないため。"""
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "win32"),
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="9.9.9"
        ),
    ):
        res = client.get("/api/versions")
    vis = _components(res.json())["visualizer"]
    assert vis["updatable"] is False
    assert vis["message"] is not None
