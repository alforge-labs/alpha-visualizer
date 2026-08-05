"""GET /api/setup/status（issue #492）のテスト。

セットアップ状態の集約判定。設計の要点:

- 5 チェック（cli / eula / workspace / auth / data）を 1 レスポンスに集約
- 個別の CLI 呼び出し失敗はそのチェックだけ ``unknown`` にして 200 を維持
  （1 項目の失敗で画面全体を壊さない）
- EULA は ``system paths --json`` の失敗が既存の定型文へ変換されたかで検知
- ``auth status`` の ``user_id`` は応答に載せない（プライバシー）

CLI 呼び出しは ``routers.setup`` 名前空間の ``run_forge_json`` /
``run_forge_capture`` / ``resolve_forge_exe`` を patch する（実 PATH を見ると
CLI の無い CI で結果が実行マシン依存になる — data / agent ルーターと同じ罠）。
"""
from __future__ import annotations

import pathlib
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.errors import ExternalProcessError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.forge_cli import FORGE_EULA_NOT_ACCEPTED_MESSAGE

VERSION_STDOUT = "AlphaForge, version 1.3.0\nCheck for updates: alpha-forge self version\n"

AUTH_OK = {
    "dev_skip": False,
    "logged_in": True,
    "user_id": "user_SECRET123",
    "plan_type": "paid",
    "expires_at": "2026-08-05T12:02:24+00:00",
}

DATA_THREE = {"datasets": [{"symbol": "CL=F"}, {"symbol": "GC=F"}, {"symbol": "6J=F"}], "count": 3}


def _fake_run_forge_json(
    *,
    paths: dict[str, Any] | Exception | None = None,
    auth: dict[str, Any] | Exception | None = None,
    data: dict[str, Any] | Exception | None = None,
) -> Any:
    """argv 先頭で分岐するスタブ。Exception を渡すとその呼び出しで raise する。"""

    def side_effect(argv: list[str], forge_cfg: ForgeConfig, timeout: int) -> dict[str, Any]:
        table: dict[str, dict[str, Any] | Exception | None] = {
            "system paths": paths,
            "system auth": auth,
            "data list": data,
        }
        key = " ".join(argv[:2])
        result = table.get(key)
        if result is None:
            raise AssertionError(f"予期しない forge 呼び出し: {argv}")
        if isinstance(result, Exception):
            raise result
        return result

    return side_effect


@pytest.fixture()
def workspace_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    """forge.yaml のある（= config_path が解決できる）workspace。"""
    (tmp_path / "forge.yaml").write_text("{}\n", encoding="utf-8")
    return tmp_path


def _client(forge_dir: pathlib.Path) -> TestClient:
    return TestClient(create_app(forge_dir=forge_dir))


def _get_status(
    forge_dir: pathlib.Path,
    *,
    exe: str | None = "/stub/alpha-forge",
    version_stdout: str | Exception = VERSION_STDOUT,
    paths: dict[str, Any] | Exception | None = None,
    auth: dict[str, Any] | Exception | None = None,
    data: dict[str, Any] | Exception | None = None,
) -> dict[str, Any]:
    """patch 一式を張って GET /api/setup/status の JSON を返す。"""
    if paths is None:
        paths = {"paths": {"config": str(forge_dir / "forge.yaml")}}
    if auth is None:
        auth = dict(AUTH_OK)
    if data is None:
        data = dict(DATA_THREE)

    def capture(argv: list[str], forge_cfg: ForgeConfig, timeout: int) -> str:
        if isinstance(version_stdout, Exception):
            raise version_stdout
        return version_stdout

    with (
        mock.patch("alpha_visualizer.routers.setup.resolve_forge_exe", return_value=exe),
        mock.patch("alpha_visualizer.routers.setup.run_forge_capture", side_effect=capture),
        mock.patch(
            "alpha_visualizer.routers.setup.run_forge_json",
            side_effect=_fake_run_forge_json(paths=paths, auth=auth, data=data),
        ),
    ):
        resp = _client(forge_dir).get("/api/setup/status")
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


class TestSetupStatus:
    def test_全部揃うと全チェックokでready(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(workspace_dir)
        assert body["ready"] is True
        assert body["cli"] == {"status": "ok", "version": "1.3.0"}
        assert body["eula"]["status"] == "ok"
        assert body["workspace"]["status"] == "ok"
        assert body["workspace"]["config_path"] == str(workspace_dir / "forge.yaml")
        assert body["auth"]["status"] == "ok"
        assert body["auth"]["plan_type"] == "paid"
        assert body["data"] == {"status": "ok", "count": 3}

    def test_forge未導入はcliがattentionで他はunknown(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(workspace_dir, exe=None)
        assert body["ready"] is False
        assert body["cli"]["status"] == "attention"
        for check in ("eula", "workspace", "auth", "data"):
            assert body[check]["status"] == "unknown", check

    def test_EULA未同意はeulaがattentionで下流はunknown(
        self, workspace_dir: pathlib.Path
    ) -> None:
        eula_error = ExternalProcessError(FORGE_EULA_NOT_ACCEPTED_MESSAGE)
        body = _get_status(
            workspace_dir,
            paths=eula_error,
            auth=ExternalProcessError(FORGE_EULA_NOT_ACCEPTED_MESSAGE),
            data=ExternalProcessError(FORGE_EULA_NOT_ACCEPTED_MESSAGE),
        )
        assert body["ready"] is False
        assert body["cli"]["status"] == "ok"
        assert body["eula"]["status"] == "attention"
        assert body["workspace"]["status"] == "unknown"
        assert body["auth"]["status"] == "unknown"
        assert body["data"]["status"] == "unknown"

    def test_未ログインはauthがattention(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(
            workspace_dir, auth={"dev_skip": False, "logged_in": False, "plan_type": None}
        )
        assert body["auth"]["status"] == "attention"
        assert body["auth"]["logged_in"] is False
        assert body["ready"] is False

    def test_dev_skipはauthをokにする(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(
            workspace_dir, auth={"dev_skip": True, "logged_in": False, "plan_type": None}
        )
        assert body["auth"]["status"] == "ok"

    def test_データゼロはdataがattention(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(workspace_dir, data={"datasets": [], "count": 0})
        assert body["data"] == {"status": "attention", "count": 0}
        assert body["ready"] is False

    def test_forge_yamlが無いとworkspaceがattention(self, tmp_path: pathlib.Path) -> None:
        """config_path が解決できない = GUI ジョブと表示が別 workspace を向く事故の前兆。"""
        body = _get_status(tmp_path, paths={"paths": {}})
        assert body["workspace"]["status"] == "attention"
        assert body["workspace"]["config_path"] is None
        assert body["ready"] is False

    def test_個別のCLI失敗はそのチェックだけunknownで200(
        self, workspace_dir: pathlib.Path
    ) -> None:
        body = _get_status(workspace_dir, data=ExternalProcessError("boom"))
        assert body["data"]["status"] == "unknown"
        # 他のチェックは無傷（1 項目の失敗で画面全体を壊さない）
        assert body["cli"]["status"] == "ok"
        assert body["eula"]["status"] == "ok"
        assert body["auth"]["status"] == "ok"
        assert body["ready"] is False

    def test_versionパース不能でもcliはok(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(workspace_dir, version_stdout="something unexpected\n")
        assert body["cli"] == {"status": "ok", "version": None}
        # version はおまけ情報。取れなくても ready は落とさない
        assert body["ready"] is True

    def test_user_idを応答に含めない(self, workspace_dir: pathlib.Path) -> None:
        body = _get_status(workspace_dir)
        assert "user_SECRET123" not in str(body)
