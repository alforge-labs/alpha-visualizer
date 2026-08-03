"""agent CLI ヘルパー（検出・argv・失敗変換）のテスト。"""
from __future__ import annotations

import pathlib
import stat

import pytest

from alpha_visualizer.services.agent_cli import (
    AGENT_NOT_FOUND_MESSAGES,
    agent_version,
    build_agent_argv,
    resolve_agent_exe,
    translate_agent_failure,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    """--version を出力するスタブ実行ファイルを作る。"""
    stub = tmp_path / "agent-stub.sh"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


class TestResolveAgentExe:
    def test_found(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            "alpha_visualizer.services.agent_cli.shutil.which",
            lambda name: f"/usr/local/bin/{name}",
        )
        assert resolve_agent_exe("claude") == "/usr/local/bin/claude"
        assert resolve_agent_exe("codex") == "/usr/local/bin/codex"

    def test_not_found(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            "alpha_visualizer.services.agent_cli.shutil.which", lambda name: None
        )
        assert resolve_agent_exe("claude") is None


class TestBuildAgentArgv:
    def test_claude_restricts_tools_and_denies_by_default(self) -> None:
        """WHY: dontAsk + allowedTools がワークスペース限定の権限モデルの本体。
        ここが欠けると Web UI のボタン一つで無制限のエージェントが走る。"""
        argv = build_agent_argv("/bin/claude", "claude", "do it")
        assert argv[0] == "/bin/claude"
        assert argv[1:3] == ["-p", "do it"]
        assert "--permission-mode" in argv
        assert argv[argv.index("--permission-mode") + 1] == "dontAsk"
        allowed = argv[argv.index("--allowedTools") + 1]
        assert "Bash(alpha-forge *)" in allowed
        assert "Read" in allowed and "Write" in allowed and "Edit" in allowed
        # stream-json は -p では --verbose 必須の版がある
        assert "--output-format" in argv and "stream-json" in argv
        assert "--verbose" in argv
        assert "--max-turns" in argv

    def test_codex_uses_workspace_write_sandbox(self) -> None:
        """WHY: workspace-write が OS レベルの書き込み制限・ネットワーク遮断を担う。"""
        argv = build_agent_argv("/bin/codex", "codex", "do it")
        assert argv[:2] == ["/bin/codex", "exec"]
        assert argv[argv.index("--sandbox") + 1] == "workspace-write"
        # forge ワークスペースは git リポジトリとは限らない
        assert "--skip-git-repo-check" in argv
        # prompt が - で始まる場合に CLI フラグと誤認されるのを防ぐ
        assert argv[-2] == "--"
        assert argv[-1] == "do it"


class TestTranslateAgentFailure:
    def test_login_failure_becomes_guidance(self) -> None:
        msg = translate_agent_failure("claude", "", "Invalid API key · Please run /login")
        assert msg is not None and "claude" in msg

    def test_codex_login_failure(self) -> None:
        msg = translate_agent_failure("codex", "Not logged in. Run codex login.", "")
        assert msg is not None and "codex" in msg

    def test_unknown_failure_returns_none(self) -> None:
        """WHY: 既定文言に丸めると原因不明の失敗が全部同じ表示になり調査不能
        （translate_forge_failure と同じ契約）。"""
        assert translate_agent_failure("claude", "boom", "unrelated") is None


def test_not_found_messages_cover_both_backends() -> None:
    assert set(AGENT_NOT_FOUND_MESSAGES) == {"claude", "codex"}
    for msg in AGENT_NOT_FOUND_MESSAGES.values():
        assert "http" in msg  # 導入先 URL への導線を必ず含める


class TestAgentVersion:
    async def test_success(self, tmp_path: pathlib.Path) -> None:
        """正常系: スタブが version を出力するとその 1 行目が返る。"""
        stub = _make_stub(tmp_path, 'echo "claude 1.2.3"\necho "extra line"')
        version = await agent_version(stub)
        assert version == "claude 1.2.3"

    async def test_not_found(self) -> None:
        """失敗系: 存在しないパスを渡すと None が返る。"""
        version = await agent_version("/nonexistent/agent")
        assert version is None

    async def test_empty_output(self, tmp_path: pathlib.Path) -> None:
        """出力が空のとき None が返る。"""
        stub = _make_stub(tmp_path, "# no output")
        version = await agent_version(stub)
        assert version is None
