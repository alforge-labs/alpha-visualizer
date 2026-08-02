"""agent ルーター（AI 戦略開発 API）のテスト。"""

from __future__ import annotations

import pathlib
import stat
import time
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.jobs import JobManager


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    stub = tmp_path / "agent-stub.sh"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


AGENT_BODY = (
    "echo '{\"type\": \"result\", \"subtype\": \"success\", \"result\":"
    " \"{\\\"strategy_id\\\": \\\"new_s1\\\", \\\"run_id\\\": \\\"run-7\\\"}\"}'\n"
)


def _client(
    tmp_path: pathlib.Path,
    *,
    agent_stub: str | None,
    forge_available: bool = True,
    agent_enabled: bool = True,
) -> TestClient:
    app = create_app(forge_dir=tmp_path, agent_enabled=agent_enabled)
    app.state.job_manager = JobManager(
        forge_config=ForgeConfig.from_forge_dir(tmp_path),
        forge_resolver=lambda: "/bin/true" if forge_available else None,
        agent_resolver=lambda backend: agent_stub,
        concurrency=1,
        agent_timeout_sec=30,
    )
    return TestClient(app)


@pytest.fixture()
def agent_client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    stub = _make_stub(tmp_path, AGENT_BODY)
    with _client(tmp_path, agent_stub=stub) as client:
        yield client


def _wait_terminal(client: TestClient, job_id: str, timeout: float = 10.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in {"succeeded", "failed", "cancelled"}:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} が終了しませんでした: {body}")


class TestAgentBackends:
    def test_lists_backends_with_availability(
        self,
        tmp_path: pathlib.Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # ルーターはモジュール関数 resolve_agent_exe を直接使うため patch する
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe",
            lambda backend: "/bin/claude" if backend == "claude" else None,
        )
        async def fake_version(exe: str) -> str:
            return "1.0.0 (Claude Code)"
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.agent_version", fake_version
        )
        with _client(tmp_path, agent_stub=None) as client:
            body = client.get("/api/agent/backends").json()
        assert body["enabled"] is True
        by_id = {b["id"]: b for b in body["backends"]}
        assert by_id["claude"]["available"] is True
        assert by_id["claude"]["version"] == "1.0.0 (Claude Code)"
        assert by_id["codex"]["available"] is False
        assert by_id["codex"]["version"] is None

    def test_disabled_when_non_loopback(self, tmp_path: pathlib.Path) -> None:
        with _client(tmp_path, agent_stub=None, agent_enabled=False) as client:
            body = client.get("/api/agent/backends").json()
        assert body["enabled"] is False


class TestCreateAgentJob:
    def test_creates_job_and_completes(self, agent_client: TestClient) -> None:
        resp = agent_client.post(
            "/api/agent/jobs",
            json={"goal": "RSI 逆張り戦略を作る", "symbol": "CL=F", "backend": "claude"},
        )
        assert resp.status_code == 202
        body = resp.json()
        assert body["kind"] == "agent"
        done = _wait_terminal(agent_client, body["job_id"])
        assert done["status"] == "succeeded"
        assert done["result"]["strategy_id"] == "new_s1"
        assert done["result"]["run_id"] == "run-7"

    def test_empty_goal_is_422(self, agent_client: TestClient) -> None:
        resp = agent_client.post(
            "/api/agent/jobs", json={"goal": "", "backend": "claude"}
        )
        assert resp.status_code == 422

    def test_unknown_backend_is_422(self, agent_client: TestClient) -> None:
        resp = agent_client.post(
            "/api/agent/jobs", json={"goal": "g", "backend": "gemini"}
        )
        assert resp.status_code == 422

    def test_disabled_returns_403_with_code(self, tmp_path: pathlib.Path) -> None:
        """WHY: 非 loopback 公開時の遮断が権限モデルの最後の砦。"""
        stub = _make_stub(tmp_path, AGENT_BODY)
        with _client(tmp_path, agent_stub=stub, agent_enabled=False) as client:
            resp = client.post(
                "/api/agent/jobs", json={"goal": "g", "backend": "claude"}
            )
        assert resp.status_code == 403
        assert resp.json()["code"] == "agent_disabled"

    def test_agent_cli_missing_returns_503_with_code(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe", lambda backend: None
        )
        with _client(tmp_path, agent_stub=None) as client:
            resp = client.post(
                "/api/agent/jobs", json={"goal": "g", "backend": "claude"}
            )
        assert resp.status_code == 503
        assert resp.json()["code"] == "agent_cli_not_found"

    def test_forge_missing_returns_503(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_forge_exe", lambda: None
        )
        stub = _make_stub(tmp_path, AGENT_BODY)
        with _client(tmp_path, agent_stub=stub) as client:
            resp = client.post(
                "/api/agent/jobs", json={"goal": "g", "backend": "claude"}
            )
        assert resp.status_code == 503
        assert resp.json()["code"] == "forge_cli_not_found"
