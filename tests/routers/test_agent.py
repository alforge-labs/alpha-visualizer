"""agent ルーター（AI 戦略開発 API）のテスト。"""

from __future__ import annotations

import asyncio
import pathlib
import stat
import textwrap
import time
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.agent_cli import (
    DEFAULT_CLAUDE_MAX_TURNS,
    MAX_CLAUDE_MAX_TURNS,
)
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
def agent_client(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    stub = _make_stub(tmp_path, AGENT_BODY)
    # WHY: ルーターはモジュール関数 resolve_forge_exe / resolve_agent_exe を
    # 直接呼んで実 PATH を引くため、patch しないとテスト結果が実行マシンの
    # CLI 導入状況に依存する（CI には無い・開発機にはある）。
    monkeypatch.setattr(
        "alpha_visualizer.routers.agent.resolve_forge_exe", lambda: "/bin/true"
    )
    monkeypatch.setattr(
        "alpha_visualizer.routers.agent.resolve_agent_exe", lambda backend: stub
    )
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

    def test_versions_are_probed_in_parallel(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: claude / codex の --version を直列 await すると、両方が詰まった
        ときタイムアウト 2 回分（最悪 10 秒）ナビの表示がブロックされる。
        並列なら最悪 1 回分で済む。"""
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe",
            lambda backend: f"/bin/{backend}",
        )
        in_flight = 0
        peak = 0

        async def fake_version(exe: str) -> str:
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.05)
            in_flight -= 1
            return "1.0.0"

        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.agent_version", fake_version
        )
        with _client(tmp_path, agent_stub=None) as client:
            body = client.get("/api/agent/backends").json()

        assert peak == 2, "version 検出が直列になっている"
        assert [b["version"] for b in body["backends"]] == ["1.0.0", "1.0.0"]

    def test_exposes_turn_limit_defaults(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: GUI はターン上限の既定値・上限をこの応答から得る。フロントに
        数値を二重定義すると、サーバー既定を変えたときに表示だけが古くなる。"""
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe", lambda backend: None
        )
        with _client(tmp_path, agent_stub=None) as client:
            body = client.get("/api/agent/backends").json()
        assert body["default_max_turns"] == DEFAULT_CLAUDE_MAX_TURNS
        assert body["max_max_turns"] == MAX_CLAUDE_MAX_TURNS

    def test_disabled_when_non_loopback(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: 無効時は CLI 検出・``--version`` 実行を一切行わず 403 で
        遮断する（検出結果の開示自体が任意コード実行の下調べに使われうる
        ため）。スパイで「呼ばれたら fail」にし、検出が実行されないことを
        実証する（従来は本物の CLI --version を実行してしまっていた）。
        """

        def fail_if_called(*_args: object, **_kwargs: object) -> None:
            raise AssertionError("agent_enabled=False なのに検出処理が呼ばれた")

        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe", fail_if_called
        )
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.agent_version", fail_if_called
        )
        with _client(tmp_path, agent_stub=None, agent_enabled=False) as client:
            resp = client.get("/api/agent/backends")
        assert resp.status_code == 403
        assert resp.json()["code"] == "agent_disabled"


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

    # NOTE: "--json" のような「-」始まりの値はこの pattern を通る。argv では
    # 必ず "--" の後ろに置く契約（build_argv）で無害化しており、ここで弾く
    # 対象はシェルメタ文字・空白・パス区切りを含む値。
    @pytest.mark.parametrize(
        "symbol",
        ["CL=F; rm -rf /", "$(whoami)", "`id`", "AA PL", "../../etc/passwd", "a\nb"],
    )
    def test_malformed_symbol_is_422(
        self, agent_client: TestClient, symbol: str
    ) -> None:
        """WHY: symbol はエージェントのプロンプトへそのまま埋め込まれ、
        エージェントはそれを alpha-forge のコマンドラインに使う。境界での
        形式制限がこの経路唯一のサニタイズであり、緩めると外部入力が
        シェル引数として下流に流れる。"""
        resp = agent_client.post(
            "/api/agent/jobs",
            json={"goal": "g", "symbol": symbol, "backend": "claude"},
        )
        assert resp.status_code == 422

    def test_max_turns_is_passed_to_the_job(self, agent_client: TestClient) -> None:
        """WHY: GUI で指定した上限がジョブに届かなければ設定 UI は嘘になる。"""
        job_id = agent_client.post(
            "/api/agent/jobs",
            json={"goal": "g", "backend": "claude", "max_turns": 33},
        ).json()["job_id"]
        record = agent_client.app.state.job_manager.get(job_id)  # type: ignore[attr-defined]
        assert record is not None
        assert record.max_turns == 33

    @pytest.mark.parametrize("bad", [0, -1, MAX_CLAUDE_MAX_TURNS + 1])
    def test_out_of_range_max_turns_is_422(
        self, agent_client: TestClient, bad: int
    ) -> None:
        """WHY: 上限を設けるのは暴走時の課金が青天井にならないようにするため。
        境界の検証がないと、UI をバイパスした呼び出しで無制限に指定できる。"""
        resp = agent_client.post(
            "/api/agent/jobs",
            json={"goal": "g", "backend": "claude", "max_turns": bad},
        )
        assert resp.status_code == 422

    def test_prompt_pins_forge_config_when_forge_yaml_exists(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: ログインシェルの rc が FORGE_CONFIG を別ワークスペースへ
        書き換える実測事例（#470）への対策。forge.yaml があるときは必ず
        プロンプトでピン留めされることをルーター経由で保証する。"""
        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
                report:
                  output_path: ./data/results
                strategies:
                  path: ./data/strategies
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )
        stub = _make_stub(tmp_path, AGENT_BODY)
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_forge_exe", lambda: "/bin/true"
        )
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe", lambda backend: stub
        )
        with _client(tmp_path, agent_stub=stub) as client:
            job_id = client.post(
                "/api/agent/jobs", json={"goal": "g", "backend": "claude"}
            ).json()["job_id"]
            record = client.app.state.job_manager.get(job_id)  # type: ignore[attr-defined]
            assert record is not None
            assert record.prompt is not None
            assert f"FORGE_CONFIG={tmp_path / 'forge.yaml'}" in record.prompt

    def test_prompt_pins_forge_config_for_out_of_tree_yaml(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: forge.yaml は --forge-config や FORGE_CONFIG でワークスペースの
        外に置ける。<forge_dir>/forge.yaml 規約でピンを組み立てていると、
        別置き運用ではピンが付かず rc の上書き問題が再発する。"""
        forge_dir = tmp_path / "workspace"
        forge_dir.mkdir()
        external_yaml = tmp_path / "elsewhere" / "forge.yaml"
        external_yaml.parent.mkdir()
        external_yaml.write_text("report:\n  output_path: ./data/results\n", encoding="utf-8")
        stub = _make_stub(tmp_path, AGENT_BODY)
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_forge_exe", lambda: "/bin/true"
        )
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_agent_exe", lambda backend: stub
        )
        config = ForgeConfig.from_forge_dir(forge_dir, config_path=external_yaml)
        app = create_app(config=config, agent_enabled=True)
        app.state.job_manager = JobManager(
            forge_config=config,
            forge_resolver=lambda: "/bin/true",
            agent_resolver=lambda backend: stub,
            concurrency=1,
            agent_timeout_sec=30,
        )
        with TestClient(app) as client:
            job_id = client.post(
                "/api/agent/jobs", json={"goal": "g", "backend": "claude"}
            ).json()["job_id"]
            record = client.app.state.job_manager.get(job_id)  # type: ignore[attr-defined]
            assert record is not None
            assert record.prompt is not None
            assert f"FORGE_CONFIG={external_yaml}" in record.prompt

    def test_prompt_has_no_config_pin_without_forge_yaml(
        self, agent_client: TestClient
    ) -> None:
        """WHY: forge.yaml が無いワークスペースで存在しないパスをピンすると、
        エージェントの全コマンドが設定読み込みで失敗する。"""
        job_id = agent_client.post(
            "/api/agent/jobs", json={"goal": "g", "backend": "claude"}
        ).json()["job_id"]
        record = agent_client.app.state.job_manager.get(job_id)  # type: ignore[attr-defined]
        assert record is not None
        assert record.prompt is not None
        assert "FORGE_CONFIG=" not in record.prompt

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
        # WHY: forge チェックを実 PATH 依存にしないため通過させ、agent
        # チェックに到達させる（CI には alpha-forge も無く、patch しないと
        # forge_cli_not_found で落ちてしまう）。
        monkeypatch.setattr(
            "alpha_visualizer.routers.agent.resolve_forge_exe", lambda: "/bin/true"
        )
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
