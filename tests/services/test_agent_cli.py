"""agent CLI ヘルパー（検出・argv・失敗変換）のテスト。"""
from __future__ import annotations

import pytest

from alpha_visualizer.services.agent_cli import (
    AGENT_NOT_FOUND_MESSAGES,
    build_agent_argv,
    resolve_agent_exe,
    translate_agent_failure,
)


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
