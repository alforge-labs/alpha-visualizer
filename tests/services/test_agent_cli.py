"""agent CLI ヘルパー（検出・argv・失敗変換）のテスト。"""
from __future__ import annotations

import asyncio
import pathlib
import stat

import pytest

from alpha_visualizer.services.agent_cli import (
    AGENT_NOT_FOUND_MESSAGES,
    agent_version,
    build_agent_argv,
    build_claude_allowed_tools,
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


WS = pathlib.Path("/tmp/ws")


class TestBuildAgentArgv:
    def test_claude_restricts_tools_and_denies_by_default(self) -> None:
        """WHY: dontAsk + allowedTools がワークスペース限定の権限モデルの本体。
        ここが欠けると Web UI のボタン一つで無制限のエージェントが走る。"""
        argv = build_agent_argv("/bin/claude", "claude", "do it", WS)
        assert argv[0] == "/bin/claude"
        assert argv[1:3] == ["-p", "do it"]
        assert "--permission-mode" in argv
        assert argv[argv.index("--permission-mode") + 1] == "dontAsk"
        allowed = argv[argv.index("--allowedTools") + 1]
        assert "Bash(alpha-forge *)" in allowed
        # stream-json は -p では --verbose 必須の版がある
        assert "--output-format" in argv and "stream-json" in argv
        assert "--verbose" in argv
        assert "--max-turns" in argv

    def test_claude_scopes_file_tools_to_the_workspace(self) -> None:
        """WHY: cwd 固定とプロンプト指示だけでは、絶対パスを使う読み書きを
        ワークスペース内に閉じ込められない（悪意あるゴール文を貼られた場合の
        経路）。読み書きはパススコープ付きのルールで縛る。"""
        allowed = build_claude_allowed_tools(WS)
        assert "Read(//tmp/ws/**)" in allowed
        # Edit ルールがファイル編集ツール全体（Write / NotebookEdit を含む）を
        # 覆う。Write(path) 形式はファイルパーミッション判定の対象外で効かない
        assert "Edit(//tmp/ws/**)" in allowed
        assert "Write(" not in allowed
        # スコープ無しの素の Read / Edit が残っていないこと（残ると全域許可に戻る）
        assert "Read," not in allowed and allowed != "Read"
        assert "Edit," not in allowed

    def test_claude_allowed_tools_uses_the_actual_workspace(self) -> None:
        """WHY: 定数化して別ディレクトリのスコープを渡すと、防御が別の場所に
        かかって実質無効になる。渡したワークスペースが反映されることを固定する。"""
        allowed = build_claude_allowed_tools(pathlib.Path("/var/data/other-ws"))
        assert "Read(//var/data/other-ws/**)" in allowed
        assert "/tmp/ws" not in allowed

    def test_codex_uses_workspace_write_sandbox(self) -> None:
        """WHY: workspace-write が OS レベルの書き込み制限・ネットワーク遮断を担う。

        メンバーシップ検査ではなく完全一致で固定する。``in argv`` だけでは
        ``--dangerously-bypass-approvals-and-sandbox`` のような危険フラグが
        後から紛れ込んでも検出できない（サンドボックスが無効化される）。
        """
        assert build_agent_argv("/bin/codex", "codex", "do it", WS) == [
            "/bin/codex",
            "exec",
            "--sandbox",
            "workspace-write",
            "--skip-git-repo-check",
            "--json",
            # prompt が - で始まる場合に CLI フラグと誤認されるのを防ぐ
            "--",
            "do it",
        ]

    def test_claude_argv_carries_no_unexpected_flags(self) -> None:
        """WHY: claude 側も同様に、権限を緩めるフラグ（例:
        --dangerously-skip-permissions）の混入を検出できる形で固定する。
        値そのものは他テストが意味づけて検証しているため、ここではフラグ
        集合のみを完全一致で押さえる。"""
        argv = build_agent_argv("/bin/claude", "claude", "do it", WS)
        assert {a for a in argv if a.startswith("--")} == {
            "--output-format",
            "--verbose",
            "--permission-mode",
            "--allowedTools",
            "--max-turns",
        }


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

    def test_incidental_login_path_is_not_a_login_failure(self) -> None:
        """WHY: 素の "/login" はエージェントが書いたパスや戦略 id にも現れる。
        それを認証切れと誤訳すると、本当の失敗原因が案内文に置き換わって消える。"""
        assert (
            translate_agent_failure(
                "claude", "created src/routes/login.ts", "TypeError: boom"
            )
            is None
        )

    def test_markers_are_scoped_per_backend(self) -> None:
        """WHY: 認証切れの文言は CLI ごとに異なる。共通の語彙で判定すると、
        codex の失敗に claude 固有の語が混ざった場合に誤った復旧手順を案内する。"""
        assert translate_agent_failure("codex", "please run /login", "") is None


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

    async def test_timeout_kills_the_child_process(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: asyncio の wait_for はタイムアウトしても子プロセスを残す。
        GET /api/agent/backends は画面遷移のたびに呼ばれるため、ハングする
        バイナリが 1 つあると呼び出し回数だけプロセスがリークする。"""
        # exec: sh を置き換えて単一プロセスにする（kill 対象を確定させる）
        stub = _make_stub(tmp_path, "exec sleep 30")
        spawned: list[asyncio.subprocess.Process] = []
        real_exec = asyncio.create_subprocess_exec

        async def spy(*args: object, **kwargs: object) -> asyncio.subprocess.Process:
            proc = await real_exec(*args, **kwargs)  # type: ignore[arg-type]
            spawned.append(proc)
            return proc

        monkeypatch.setattr(
            "alpha_visualizer.services.agent_cli.asyncio.create_subprocess_exec", spy
        )
        monkeypatch.setattr(
            "alpha_visualizer.services.agent_cli.VERSION_TIMEOUT_SEC", 0.2
        )

        assert await agent_version(stub) is None
        assert spawned, "スタブが起動していない（テストの前提が壊れている）"
        assert spawned[0].returncode is not None, "タイムアウト後も子プロセスが残っている"
