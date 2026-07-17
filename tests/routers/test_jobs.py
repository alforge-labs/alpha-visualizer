"""jobs ルーター（非同期ジョブ API + SSE）のテスト。

バックグラウンドタスクをリクエスト間で生かし続けるため、TestClient は
コンテキストマネージャ（lifespan 付き portal）で使う。forge の代わりに
スタブ実行ファイルを JobManager に注入する。
"""

from __future__ import annotations

import json
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
    stub = tmp_path / "forge-stub.sh"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


@pytest.fixture()
def jobs_client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    """スタブ forge を注入したジョブ API クライアント。"""
    stub = _make_stub(
        tmp_path,
        'echo "step 1" >&2\n'
        'printf \'{"run_id": "run-job-1", "metrics": {"sharpe_ratio": 2.0}}\'\n',
    )
    app = create_app(forge_dir=tmp_path)
    app.state.job_manager = JobManager(
        forge_config=ForgeConfig.from_forge_dir(tmp_path),
        forge_resolver=lambda: stub,
        concurrency=1,
        timeout_sec=30,
    )
    with TestClient(app) as client:
        yield client


def _wait_status(
    client: TestClient, job_id: str, statuses: set[str], timeout: float = 10.0
) -> dict:
    """ジョブが指定ステータスに到達するまでポーリングする。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in statuses:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} が {statuses} になりませんでした: {body}")


class TestJobsRouter:
    def test_create_and_complete_job(self, jobs_client: TestClient) -> None:
        resp = jobs_client.post(
            "/api/jobs",
            json={"kind": "backtest", "strategy_id": "s1", "symbol": "AAPL"},
        )
        assert resp.status_code == 202
        body = resp.json()
        assert body["kind"] == "backtest"
        assert body["status"] in {"queued", "running"}

        done = _wait_status(jobs_client, body["job_id"], {"succeeded", "failed"})
        assert done["status"] == "succeeded"
        assert done["result"]["run_id"] == "run-job-1"
        assert done["result"]["metrics"] == {"sharpe_ratio": 2.0}
        assert "step 1" in done["log_tail"]

    def test_list_jobs(self, jobs_client: TestClient) -> None:
        created = jobs_client.post(
            "/api/jobs",
            json={"kind": "optimize", "strategy_id": "s1", "symbol": "AAPL", "trials": 5},
        ).json()
        _wait_status(jobs_client, created["job_id"], {"succeeded", "failed"})

        listed = jobs_client.get("/api/jobs").json()
        assert any(item["job_id"] == created["job_id"] for item in listed)
        # 一覧はサマリのみ（ログや結果詳細は含めない）
        assert "log_tail" not in listed[0]

    def test_get_unknown_job_returns_404(self, jobs_client: TestClient) -> None:
        resp = jobs_client.get("/api/jobs/job-unknown")
        assert resp.status_code == 404

    @pytest.mark.parametrize(
        "payload",
        [
            {"kind": "invalid", "strategy_id": "s1", "symbol": "AAPL"},
            {"kind": "backtest", "strategy_id": "", "symbol": "AAPL"},
            {"kind": "backtest", "strategy_id": "s1", "symbol": ""},
            {"kind": "optimize", "strategy_id": "s1", "symbol": "AAPL", "trials": 0},
            {"kind": "wft", "strategy_id": "s1", "symbol": "AAPL", "windows": 1},
        ],
    )
    def test_create_job_validation(self, jobs_client: TestClient, payload: dict) -> None:
        resp = jobs_client.post("/api/jobs", json=payload)
        assert resp.status_code == 422

    def test_create_job_returns_429_when_active_limit_reached(
        self, tmp_path: pathlib.Path
    ) -> None:
        """非 terminal ジョブが上限に達したら 429 を返す（流量ガード）"""
        stub = _make_stub(tmp_path, "sleep 30\n")
        app = create_app(forge_dir=tmp_path)
        app.state.job_manager = JobManager(
            forge_config=ForgeConfig.from_forge_dir(tmp_path),
            forge_resolver=lambda: stub,
            concurrency=1,
            timeout_sec=60,
            max_active=1,
        )
        with TestClient(app) as client:
            first = client.post(
                "/api/jobs",
                json={"kind": "backtest", "strategy_id": "s1", "symbol": "AAPL"},
            )
            assert first.status_code == 202

            second = client.post(
                "/api/jobs",
                json={"kind": "backtest", "strategy_id": "s2", "symbol": "MSFT"},
            )
            assert second.status_code == 429

            # 後始末: 実行中ジョブを止める
            client.post(f"/api/jobs/{first.json()['job_id']}/cancel")
            _wait_status(client, first.json()["job_id"], {"cancelled"})

    def test_cancel_job(self, tmp_path: pathlib.Path) -> None:
        stub = _make_stub(tmp_path, 'echo "started" >&2\nsleep 30\n')
        app = create_app(forge_dir=tmp_path)
        app.state.job_manager = JobManager(
            forge_config=ForgeConfig.from_forge_dir(tmp_path),
            forge_resolver=lambda: stub,
            concurrency=1,
            timeout_sec=60,
        )
        with TestClient(app) as client:
            created = client.post(
                "/api/jobs",
                json={"kind": "backtest", "strategy_id": "s1", "symbol": "AAPL"},
            ).json()
            _wait_status(client, created["job_id"], {"running"})

            resp = client.post(f"/api/jobs/{created['job_id']}/cancel")
            assert resp.status_code == 200
            done = _wait_status(client, created["job_id"], {"cancelled"})
            assert done["status"] == "cancelled"

    def test_sse_events_stream_log_and_final_status(
        self, jobs_client: TestClient
    ) -> None:
        """SSE で snapshot → (log) → 終了 status イベントが届き、接続が閉じる"""
        created = jobs_client.post(
            "/api/jobs",
            json={"kind": "backtest", "strategy_id": "s1", "symbol": "AAPL"},
        ).json()

        events: list[dict] = []
        with jobs_client.stream(
            "GET", f"/api/jobs/{created['job_id']}/events"
        ) as stream:
            assert stream.headers["content-type"].startswith("text/event-stream")
            for line in stream.iter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[len("data: "):]))
        # ジョブ終了でジェネレータが閉じるため iter_lines は必ず終わる

        assert events[0]["type"] == "snapshot"
        assert events[-1]["type"] == "status"
        assert events[-1]["status"] == "succeeded"
        assert events[-1]["result"]["run_id"] == "run-job-1"
        all_lines = [
            line
            for ev in events
            for line in ev.get("lines", [])
        ]
        assert "step 1" in all_lines

    def test_sse_unknown_job_returns_404(self, jobs_client: TestClient) -> None:
        resp = jobs_client.get("/api/jobs/job-unknown/events")
        assert resp.status_code == 404
