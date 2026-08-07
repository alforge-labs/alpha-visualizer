"""`POST /api/live/jobs`（live refresh ジョブ起動）のテスト。

data ジョブ（test_data.py）と同じガード方針:
- 非 loopback 公開中は 403（書き込み系）
- forge 未導入は 503 で fail-fast（ジョブを積んでから失敗させない）
- スタブ forge の argv echo で CLI 契約（live refresh --json）を検証する
"""

from __future__ import annotations

import pathlib
import stat
import time
from collections.abc import Iterator
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.jobs import JobManager


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    stub = tmp_path / "alpha-forge"
    stub.write_text(f"#!/bin/sh\n{body}\n")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


@pytest.fixture()
def live_jobs_client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    """スタブ forge を注入した live ジョブ用クライアント。

    ルーターの fail-fast が呼ぶ `routers.live.resolve_forge_exe` は実 PATH を
    見るため patch 必須（CLI の無い CI で 503 になる罠。test_data.py と同じ）。
    """
    stub = _make_stub(
        tmp_path,
        'echo "ARGS: $@" >&2\nprintf \'{"steps": [], "replay": {"portfolio_id": "pf_1"}}\'',
    )
    app = create_app(forge_dir=tmp_path)
    app.state.job_manager = JobManager(
        forge_config=ForgeConfig.from_forge_dir(tmp_path),
        forge_resolver=lambda: stub,
        concurrency=1,
        timeout_sec=30,
    )
    with (
        mock.patch(
            "alpha_visualizer.routers.live.resolve_forge_exe", return_value=stub
        ),
        TestClient(app) as client,
    ):
        yield client


def _wait_status(
    client: TestClient, job_id: str, statuses: set[str], timeout: float = 10.0
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    body: dict[str, Any] = {}
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body.get("status") in statuses:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} が {statuses} になりませんでした: {body}")


class TestCreateLiveJob:
    def test_refreshジョブを起動して完了する(self, live_jobs_client: TestClient) -> None:
        resp = live_jobs_client.post("/api/live/jobs", json={"action": "refresh"})
        assert resp.status_code == 202
        body = resp.json()
        assert body["kind"] == "live_refresh"

        done = _wait_status(live_jobs_client, body["job_id"], {"succeeded", "failed"})
        assert done["status"] == "succeeded"
        # CLI 契約: 引数無しの live refresh --json（パラメータは forge.yaml 側）
        assert "ARGS: live refresh --json" in done["log_tail"]

    def test_不正なactionは422(self, live_jobs_client: TestClient) -> None:
        resp = live_jobs_client.post("/api/live/jobs", json={"action": "replay"})
        assert resp.status_code == 422

    def test_forge未導入なら503(self, live_jobs_client: TestClient) -> None:
        with mock.patch(
            "alpha_visualizer.routers.live.resolve_forge_exe", return_value=None
        ):
            resp = live_jobs_client.post("/api/live/jobs", json={"action": "refresh"})
        assert resp.status_code == 503
        assert resp.json()["code"] == "forge_cli_not_found"

    def test_非loopback公開中は403(self, tmp_path: pathlib.Path) -> None:
        app = create_app(forge_dir=tmp_path, local_write_enabled=False)
        with TestClient(app) as client:
            resp = client.post("/api/live/jobs", json={"action": "refresh"})
            assert resp.status_code == 403
            assert resp.json()["code"] == "local_write_disabled"
            # 参照系（GET /api/live）はガードの対象外
            assert client.get("/api/live").status_code == 200
