# AI 戦略開発（Agent Develop）v1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GUI からユーザー自身の Claude Code / Codex CLI をヘッドレス起動し、「ゴール入力 → 戦略 JSON 作成 → バックテスト検証 → 結果反映」を一気通貫にする（spec: `docs/superpowers/specs/2026-08-02-agent-develop-design.md`）。

**Architecture:** 既存の `JobManager`（非同期ジョブ + SSE）に新ジョブ種 `agent` を追加する。新規モジュールは `services/agent_cli.py`（検出・argv）、`services/agent_prompt.py`（指示文）、`services/agent_events.py`（イベント整形）、`routers/agent.py` + `schemas/agent.py`。フロントは `/develop` ルート（Container/Presentational 分離）。

**Tech Stack:** FastAPI / Pydantic / asyncio subprocess / pytest（anyio）/ React + TypeScript / vitest / openapi-typescript

## Global Constraints

- Python は `uv run` で実行、フロントは `pnpm`（`cd frontend` してから）
- コミットメッセージは Conventional Commits・日本語（例: `feat: ...`）
- `src/alpha_visualizer/` から `alpha_forge` を import しない
- `schemas/*.py` 変更後は `cd frontend && pnpm run gen` を実行し生成物をコミット（CI が drift 検出）
- README は日英同期（`README.md` / `README.en.md` 両方更新）
- カバレッジ Python 90% / vitest thresholds を維持、mypy エラー 0
- TypeScript で `any` 禁止、全 export 関数に型注釈
- テスト実行時にポート 8000 を掴む `tests/test_cli.py` の serve 系 2 件は、ローカルで `alpha-vis serve` 稼働中のみ失敗する既知事象（コード起因と誤認しない）
- 各タスク末尾で `git add <対象ファイル> && git commit`（ブランチ: `worktree-agent-develop`）

## 設計上の既知の逸脱（spec からの変更）

spec は CLI 未検出を「424」と書いたが、既存コードベースは forge CLI 未検出を
`ForgeCliNotFoundError`（**503** + 機械可読 `code`）で表す規約（`errors.py` 参照）。
規約への準拠を優先し、agent CLI 未検出も **503 + `code`** にする。Task 11 で spec 本文も修正する。

---

### Task 1: CLI フラグの実機検証（読み取りのみ・コード変更なし）

**Files:** なし（検証結果を後続タスクの前提にする）

**Interfaces:**
- Consumes: この Mac に導入済みの `claude` / `codex` CLI
- Produces: Task 3 の argv ビルダーで使うフラグの確定情報

- [ ] **Step 1: claude のフラグを確認**

Run: `claude --help 2>&1 | grep -E "output-format|allowedTools|permission-mode|max-turns|verbose"`
Expected: `--output-format`（`stream-json` を含む）、`--allowedTools`、`--permission-mode`、`--max-turns`、`--verbose` が存在する。
注意: `claude -p` + `--output-format stream-json` は `--verbose` 必須の版がある。ヘルプに明記がなくても Task 3 の argv には `--verbose` を含める（対話版に不要でも無害）。

- [ ] **Step 2: codex exec のフラグを確認**

Run: `codex exec --help 2>&1 | grep -E "sandbox|json|skip-git|cd"`
Expected: `--sandbox <MODE>`（`workspace-write` を含む）、`--json`（JSONL イベント出力）、`--skip-git-repo-check` が存在する。
`--json` が無い版の場合: Task 3 の codex argv から `--json` を外し、Task 5 の codex 整形は「プレーンテキスト行をそのままログへ」に読み替える（`format_agent_event` が非 JSON 行を素通しする分岐を有効化）。

- [ ] **Step 3: 実際のイベント形式を最小実行でサンプリング**

Run（数十秒・数円レベルの消費。ワークスペース外の無害プロンプト）:
```bash
claude -p "Reply with exactly: OK" --output-format stream-json --verbose --max-turns 1 2>/dev/null | head -20
codex exec --skip-git-repo-check --json "Reply with exactly: OK" 2>/dev/null | head -20
```
Expected: claude は `{"type":"system",...}` → `{"type":"assistant",...}` → `{"type":"result","result":"OK",...}` の JSON Lines。codex は JSONL イベント（形式をメモし、Task 5 のテストフィクスチャ文字列をこの実物に合わせる）。

---

### Task 2: ドメイン例外の追加

**Files:**
- Modify: `src/alpha_visualizer/errors.py`（末尾に追記）
- Test: `tests/test_errors.py`（既存ファイルに追記）

**Interfaces:**
- Produces: `AgentDisabledError`（403, code="agent_disabled"）、`AgentCliNotFoundError`（503, code="agent_cli_not_found"）。Task 7 のルーターが raise し、既存の `app.py` 例外ハンドラがそのまま JSON 化する（ハンドラ変更不要）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_errors.py` の既存クラス/関数群の末尾に追記:

```python
def test_agent_disabled_error_is_403_with_code() -> None:
    """非 loopback 公開時にエージェント起動を拒む例外。

    WHY: エージェント起動は任意コード実行に近く、LAN 公開サーバーの UI から
    他者が踏める状態にしてはならない。フロントが言語別案内を出せるよう
    機械可読 code を持つ。
    """
    from alpha_visualizer.errors import AgentDisabledError

    err = AgentDisabledError("disabled")
    assert err.status_code == 403
    assert err.code == "agent_disabled"


def test_agent_cli_not_found_error_is_503_with_code() -> None:
    """agent CLI 未導入は想定内の状態（forge 未導入の 503 規約と同じ）。"""
    from alpha_visualizer.errors import AgentCliNotFoundError

    err = AgentCliNotFoundError("not found")
    assert err.status_code == 503
    assert err.code == "agent_cli_not_found"
```

- [ ] **Step 2: 失敗を確認**

Run: `uv run pytest tests/test_errors.py -q`
Expected: FAIL（ImportError: cannot import name 'AgentDisabledError'）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/errors.py` の末尾に追記:

```python
class AgentDisabledError(AlphaVisualizerError):
    """AI 戦略開発機能が無効（非 loopback バインドで公開中）。

    エージェント起動は任意コード実行に近い操作のため、LAN 公開時は
    エンドポイントごと拒否する（設計: specs/2026-08-02-agent-develop-design.md）。
    """

    status_code = 403
    code = "agent_disabled"


class AgentCliNotFoundError(AlphaVisualizerError):
    """エージェント CLI（claude / codex）が PATH に見つからない。

    forge 未導入（ForgeCliNotFoundError）と同じく想定内の状態なので
    503 + 機械可読 code で返し、フロントが導入案内を出せるようにする。
    """

    status_code = 503
    code = "agent_cli_not_found"
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_errors.py -q`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/errors.py tests/test_errors.py
git commit -m "feat: エージェント機能用のドメイン例外を追加"
```

---

### Task 3: `services/agent_cli.py` — 検出・argv 構築・失敗変換

**Files:**
- Create: `src/alpha_visualizer/services/agent_cli.py`
- Test: `tests/services/test_agent_cli.py`

**Interfaces:**
- Consumes: なし（`shutil` / `asyncio` のみ）
- Produces:
  - `AgentBackend = Literal["claude", "codex"]`
  - `AGENT_NOT_FOUND_MESSAGES: dict[AgentBackend, str]`
  - `resolve_agent_exe(backend: AgentBackend) -> str | None`
  - `build_agent_argv(exe: str, backend: AgentBackend, prompt: str) -> list[str]`
  - `translate_agent_failure(backend: AgentBackend, stdout: str, stderr: str) -> str | None`
  - `agent_version(exe: str) -> str | None`（async・5 秒タイムアウト）

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_agent_cli.py` を新規作成:

```python
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
```

- [ ] **Step 2: 失敗を確認**

Run: `uv run pytest tests/services/test_agent_cli.py -q`
Expected: FAIL（ModuleNotFoundError）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/services/agent_cli.py` を新規作成:

```python
"""エージェント CLI（claude / codex）呼び出しの共有ヘルパー。

``forge_cli.py`` と対になるモジュール。検出・argv 構築・失敗変換のみを担い、
プロセス起動そのものは ``services/jobs.py`` の責務。
設計: docs/superpowers/specs/2026-08-02-agent-develop-design.md
"""
from __future__ import annotations

import asyncio
import shutil
import subprocess
from typing import Literal

AgentBackend = Literal["claude", "codex"]

AGENT_EXE_NAMES: dict[AgentBackend, str] = {"claude": "claude", "codex": "codex"}

# forge 未導入時（FORGE_NOT_FOUND_MESSAGE）と同じ思想: 未検出はもっとも
# 導入意欲が高い接点なので、導入先への導線を必ず含める。
AGENT_NOT_FOUND_MESSAGES: dict[AgentBackend, str] = {
    "claude": (
        "claude コマンドが見つかりません。Claude Code を導入してください"
        " / claude command not found in PATH. Install Claude Code"
        " — https://claude.com/claude-code"
    ),
    "codex": (
        "codex コマンドが見つかりません。Codex CLI を導入してください"
        " / codex command not found in PATH. Install Codex CLI"
        " — https://developers.openai.com/codex/cli"
    ),
}

# 認証切れの stderr/stdout に現れる語。login への導線に変換する
_LOGIN_MARKERS = ("/login", "not logged in", "invalid api key", "codex login")

AGENT_LOGIN_MESSAGES: dict[AgentBackend, str] = {
    "claude": (
        "claude の認証が切れています。ターミナルで `claude` を起動しログインしてください"
        " / claude is not authenticated. Run `claude` in a terminal and log in"
    ),
    "codex": (
        "codex の認証が切れています。ターミナルで `codex login` を実行してください"
        " / codex is not authenticated. Run `codex login` in a terminal"
    ),
}

# クイック開発ジョブの想定ステップ（探索→作成→検証数回）に対する上限。
# 少なすぎると検証の反復が途中で切れ、多すぎると暴走時の課金が膨らむ。
CLAUDE_MAX_TURNS = 50

# ワークスペース限定・ツール絞りの本体（設計の権限モデル）。
# Glob / Grep は読み取り専用の探索ツールで、既存戦略のスキーマ学習に必要。
CLAUDE_ALLOWED_TOOLS = "Read,Write,Edit,Glob,Grep,Bash(alpha-forge *)"

VERSION_TIMEOUT_SEC = 5


def resolve_agent_exe(backend: AgentBackend) -> str | None:
    """PATH 上のエージェント CLI を解決する（無ければ None）。"""
    return shutil.which(AGENT_EXE_NAMES[backend])


def build_agent_argv(exe: str, backend: AgentBackend, prompt: str) -> list[str]:
    """backend に応じたヘッドレス実行 argv を構築する。

    作業ディレクトリは呼び出し側が subprocess の ``cwd`` で forge ワーク
    スペースに固定する前提（-C / --add-dir はここでは渡さない）。
    """
    if backend == "claude":
        return [
            exe,
            "-p",
            prompt,
            # stream-json: 進捗をイベント行で受けて SSE ログへ変換する。
            # -p との併用は --verbose 必須の版がある（無害なので常に付ける）
            "--output-format",
            "stream-json",
            "--verbose",
            # dontAsk: 許可外ツールは確認プロンプトを出さず自動拒否。
            # ヘッドレスで承認待ちハングしないための必須設定
            "--permission-mode",
            "dontAsk",
            "--allowedTools",
            CLAUDE_ALLOWED_TOOLS,
            "--max-turns",
            str(CLAUDE_MAX_TURNS),
        ]
    return [
        exe,
        "exec",
        # OS レベルサンドボックス: 書き込みは cwd 配下限定・ネットワーク遮断
        "--sandbox",
        "workspace-write",
        # forge ワークスペースは git リポジトリとは限らない
        "--skip-git-repo-check",
        "--json",
        prompt,
    ]


def translate_agent_failure(
    backend: AgentBackend, stdout: str, stderr: str
) -> str | None:
    """エージェントの失敗出力を、次の一歩を踏める案内へ変換する。

    該当パターンが無ければ None（呼び出し側は生ログへフォールバック。
    translate_forge_failure と同じ契約）。
    """
    haystack = f"{stdout}\n{stderr}".lower()
    if any(marker in haystack for marker in _LOGIN_MARKERS):
        return AGENT_LOGIN_MESSAGES[backend]
    return None


async def agent_version(exe: str) -> str | None:
    """``<exe> --version`` の 1 行目を返す（失敗・タイムアウトは None）。"""
    try:
        proc = await asyncio.create_subprocess_exec(
            exe,
            "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(
            proc.communicate(), timeout=VERSION_TIMEOUT_SEC
        )
    except (OSError, TimeoutError):
        return None
    line = stdout.decode("utf-8", errors="replace").strip().splitlines()
    return line[0] if line else None
```

Task 1 で確認した実フラグと差異があれば argv・テストをそちらに合わせる（例: codex に `--json` が無い版なら外す）。

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/services/test_agent_cli.py -q`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/services/agent_cli.py tests/services/test_agent_cli.py
git commit -m "feat: agent CLI の検出・argv 構築・失敗変換ヘルパーを追加"
```

---

### Task 4: `services/agent_prompt.py` — 指示文の組み立て

**Files:**
- Create: `src/alpha_visualizer/services/agent_prompt.py`
- Test: `tests/services/test_agent_prompt.py`

**Interfaces:**
- Consumes: `pathlib.Path`（ForgeConfig.strategies_dir を Task 7 が渡す）
- Produces: `build_agent_prompt(goal: str, symbol: str | None, strategies_dir: pathlib.Path) -> str`

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_agent_prompt.py` を新規作成:

```python
"""エージェント指示文（プロンプト）組み立てのテスト。"""

from __future__ import annotations

import pathlib

from alpha_visualizer.services.agent_prompt import build_agent_prompt

STRATS = pathlib.Path("/ws/data/strategies")


class TestBuildAgentPrompt:
    def test_embeds_goal_verbatim(self) -> None:
        prompt = build_agent_prompt("RSI 逆張りで Sharpe 1.0", "CL=F", STRATS)
        assert "RSI 逆張りで Sharpe 1.0" in prompt

    def test_embeds_symbol_and_strategies_dir(self) -> None:
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "CL=F" in prompt
        assert str(STRATS) in prompt

    def test_symbol_omitted_lets_agent_choose(self) -> None:
        prompt = build_agent_prompt("goal", None, STRATS)
        assert "choose" in prompt.lower()

    def test_requires_final_json_contract(self) -> None:
        """WHY: 最終行の {strategy_id, run_id} JSON が GUI への結果反映の生命線。
        この契約が消えるとジョブは成功しても GUI に何も出ない。"""
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "strategy_id" in prompt
        assert "run_id" in prompt

    def test_requires_workspace_only_constraint(self) -> None:
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "alpha-forge" in prompt
        assert "workspace" in prompt.lower()
```

- [ ] **Step 2: 失敗を確認**

Run: `uv run pytest tests/services/test_agent_prompt.py -q`
Expected: FAIL（ModuleNotFoundError）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/services/agent_prompt.py` を新規作成:

```python
"""クイック戦略開発ジョブのエージェント指示文を組み立てる純粋関数。

プロンプトは英語で書く（エージェント CLI の既定言語で最も安定するため）。
ユーザーのゴール文は原文のまま埋め込む。
"""
from __future__ import annotations

import pathlib

_PROMPT_TEMPLATE = """\
You are working inside an AlphaForge workspace (your current directory).

Your task: develop ONE new trading strategy that satisfies this goal.

<goal>
{goal}
</goal>

Target symbol: {symbol_line}

Steps:
1. Read a few existing strategy JSON files under `{strategies_dir}` to learn
   the exact schema used by this workspace.
2. Create ONE new strategy JSON file with a new unique id. Never overwrite or
   modify existing strategy files.
3. Validate it by running:
   `alpha-forge backtest run --strategy-file <path> --json -- <SYMBOL>`
   Iterate on the strategy until the backtest completes successfully.
4. Register the finished strategy with the alpha-forge CLI
   (see `alpha-forge strategy save --help` for the exact usage).

Constraints:
- Work only inside this workspace. The only shell command you may use is the
  `alpha-forge` CLI.
- Do not modify or delete anything you did not create.

When you are done, end your reply with a single line containing ONLY this JSON
(no code fence):
{{"strategy_id": "<id>", "run_id": "<run id of the final successful backtest>", "summary": "<one short sentence>"}}
"""


def build_agent_prompt(
    goal: str, symbol: str | None, strategies_dir: pathlib.Path
) -> str:
    """ゴール・銘柄・戦略ディレクトリからエージェント指示文を構築する。"""
    symbol_line = symbol if symbol else "choose an appropriate symbol yourself"
    return _PROMPT_TEMPLATE.format(
        goal=goal, symbol_line=symbol_line, strategies_dir=strategies_dir
    )
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/services/test_agent_prompt.py -q`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/services/agent_prompt.py tests/services/test_agent_prompt.py
git commit -m "feat: クイック戦略開発ジョブのプロンプト組み立てを追加"
```

---

### Task 5: `services/agent_events.py` — イベント整形と最終テキスト抽出

**Files:**
- Create: `src/alpha_visualizer/services/agent_events.py`
- Test: `tests/services/test_agent_events.py`

**Interfaces:**
- Consumes: `AgentBackend`（Task 3）
- Produces:
  - `format_agent_event(backend: AgentBackend, line: str) -> str | None` — ログに載せる 1 行（載せない行は None）
  - `extract_final_text(backend: AgentBackend, stdout: str) -> str | None` — 最終レスポンス本文

**注意:** テストフィクスチャの JSON 行は Task 1 Step 3 で採取した実物の形に合わせて調整すること。以下は claude の公知の stream-json 形式と codex `--json` の代表形式に基づく。

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_agent_events.py` を新規作成:

```python
"""エージェント出力イベントの整形・最終テキスト抽出のテスト。"""

from __future__ import annotations

import json

from alpha_visualizer.services.agent_events import (
    extract_final_text,
    format_agent_event,
)

CLAUDE_ASSISTANT = json.dumps(
    {
        "type": "assistant",
        "message": {
            "content": [
                {"type": "text", "text": "戦略ファイルを作成します"},
                {"type": "tool_use", "name": "Write", "input": {}},
            ]
        },
    }
)
CLAUDE_RESULT = json.dumps(
    {
        "type": "result",
        "subtype": "success",
        "result": '{"strategy_id": "cl_new_1", "run_id": "run-9", "summary": "ok"}',
    }
)


class TestFormatClaudeEvent:
    def test_assistant_text_and_tool_are_logged(self) -> None:
        line = format_agent_event("claude", CLAUDE_ASSISTANT)
        assert line is not None
        assert "戦略ファイルを作成します" in line
        assert "Write" in line

    def test_system_and_result_events_are_suppressed(self) -> None:
        """WHY: 生 JSON をそのまま流すとログが機械語で埋まり読めなくなる。"""
        assert format_agent_event("claude", '{"type": "system", "x": 1}') is None
        assert format_agent_event("claude", CLAUDE_RESULT) is None

    def test_non_json_line_is_suppressed(self) -> None:
        assert format_agent_event("claude", "plain text noise") is None


class TestExtractFinalTextClaude:
    def test_returns_result_field_of_last_result_event(self) -> None:
        stdout = "\n".join(['{"type": "system"}', CLAUDE_ASSISTANT, CLAUDE_RESULT])
        text = extract_final_text("claude", stdout)
        assert text is not None
        assert '"strategy_id"' in text

    def test_no_result_event_returns_none(self) -> None:
        assert extract_final_text("claude", CLAUDE_ASSISTANT) is None


CODEX_MESSAGE = json.dumps(
    {
        "type": "item.completed",
        "item": {
            "type": "agent_message",
            "text": '{"strategy_id": "cl_new_1", "run_id": "run-9", "summary": "ok"}',
        },
    }
)


class TestCodexEvents:
    def test_agent_message_is_logged_and_extracted(self) -> None:
        assert format_agent_event("codex", CODEX_MESSAGE) is not None
        text = extract_final_text("codex", CODEX_MESSAGE)
        assert text is not None and '"strategy_id"' in text

    def test_unknown_event_is_suppressed(self) -> None:
        assert format_agent_event("codex", '{"type": "turn.started"}') is None
```

- [ ] **Step 2: 失敗を確認**

Run: `uv run pytest tests/services/test_agent_events.py -q`
Expected: FAIL（ModuleNotFoundError）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/services/agent_events.py` を新規作成:

```python
"""エージェント CLI の JSONL イベントを人間可読ログへ変換する純粋関数。

- claude: ``--output-format stream-json`` の {"type": "assistant"|"result"|...}
- codex: ``exec --json`` の {"type": "item.completed", "item": {...}} 等

未知の形式・非 JSON 行は None（ログに載せない）。将来の CLI 変更でログが
生 JSON で埋まる事故を防ぐため、許可リスト方式で整形する。
"""
from __future__ import annotations

import json
from typing import Any

from alpha_visualizer.services.agent_cli import AgentBackend

# ログ 1 行の最大長（超過は切り詰め。SSE とメモリ保護）
LINE_MAX_CHARS = 500


def _parse(line: str) -> dict[str, Any] | None:
    try:
        data = json.loads(line)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _clip(text: str) -> str:
    text = text.strip()
    return text[:LINE_MAX_CHARS] + "…" if len(text) > LINE_MAX_CHARS else text


def _format_claude(data: dict[str, Any]) -> str | None:
    if data.get("type") != "assistant":
        return None
    content = (data.get("message") or {}).get("content")
    if not isinstance(content, list):
        return None
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and block.get("text"):
            parts.append(_clip(str(block["text"])))
        elif block.get("type") == "tool_use" and block.get("name"):
            parts.append(f"[tool: {block['name']}]")
    return " ".join(parts) if parts else None


def _format_codex(data: dict[str, Any]) -> str | None:
    item = data.get("item")
    if not isinstance(item, dict):
        return None
    if item.get("type") == "agent_message" and item.get("text"):
        return _clip(str(item["text"]))
    if item.get("type") == "command_execution" and item.get("command"):
        return f"[cmd: {_clip(str(item['command']))}]"
    return None


def format_agent_event(backend: AgentBackend, line: str) -> str | None:
    """イベント 1 行をログ表示用文字列へ変換する（対象外は None）。"""
    data = _parse(line)
    if data is None:
        return None
    if backend == "claude":
        return _format_claude(data)
    return _format_codex(data)


def extract_final_text(backend: AgentBackend, stdout: str) -> str | None:
    """stdout 全体から最終レスポンス本文を取り出す。

    claude: 最後の ``type=result`` イベントの ``result`` 文字列。
    codex: 最後の agent_message の text。
    見つからなければ None（呼び出し側は result 無し succeeded として扱う）。
    """
    final: str | None = None
    for line in stdout.splitlines():
        data = _parse(line)
        if data is None:
            continue
        if backend == "claude":
            if data.get("type") == "result" and isinstance(data.get("result"), str):
                final = data["result"]
        else:
            item = data.get("item")
            if (
                isinstance(item, dict)
                and item.get("type") == "agent_message"
                and isinstance(item.get("text"), str)
            ):
                final = item["text"]
    return final
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/services/test_agent_events.py -q`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/services/agent_events.py tests/services/test_agent_events.py
git commit -m "feat: エージェント出力イベントの整形・最終テキスト抽出を追加"
```

---

### Task 6: `services/jobs.py` に agent ジョブ種を追加

**Files:**
- Modify: `src/alpha_visualizer/services/jobs.py`
- Test: `tests/services/test_jobs.py`（クラス追加）

**Interfaces:**
- Consumes: Task 3 の `resolve_agent_exe` / `build_agent_argv` / `translate_agent_failure` / `AGENT_NOT_FOUND_MESSAGES`、Task 5 の `format_agent_event` / `extract_final_text`
- Produces:
  - `JobKind = Literal["backtest", "optimize", "wft", "agent"]`
  - `JobRecord` に `goal: str | None = None` / `backend: str | None = None` / `prompt: str | None = None` フィールド
  - `JobManager.__init__` に `agent_resolver: Callable[[AgentBackend], str | None] = resolve_agent_exe` と `agent_timeout_sec: int | None = None` 引数
  - `JobManager.create(..., goal=None, backend=None, prompt=None)` キーワード引数
  - 定数 `DEFAULT_AGENT_TIMEOUT_SEC = 1800` / `AGENT_TIMEOUT_ENV = "ALPHA_VIS_AGENT_TIMEOUT"`

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_jobs.py` の末尾にクラスを追加。既存の `_make_stub` / `_manager` を流用しつつ、agent 用マネージャ生成ヘルパーを足す:

```python
def _agent_manager(
    tmp_path: pathlib.Path,
    agent_stub: str | None,
    *,
    timeout_sec: int = 10,
) -> JobManager:
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    return JobManager(
        forge_config=cfg,
        forge_resolver=lambda: "/bin/true",  # agent ジョブでは使われない
        agent_resolver=lambda backend: agent_stub,
        concurrency=1,
        agent_timeout_sec=timeout_sec,
    )


class TestAgentJob:
    """agent ジョブ種: stdout=JSONL イベント・整形ログ・結果抽出。"""

    CLAUDE_LINES = (
        'echo \'{"type": "system", "subtype": "init"}\'\n'
        "echo '{\"type\": \"assistant\", \"message\": {\"content\":"
        " [{\"type\": \"text\", \"text\": \"working\"}]}}'\n"
        "echo '{\"type\": \"result\", \"subtype\": \"success\", \"result\":"
        " \"{\\\"strategy_id\\\": \\\"new_s1\\\", \\\"run_id\\\": \\\"run-7\\\"}\"}'\n"
    )

    async def test_agent_job_formats_log_and_extracts_result(
        self, tmp_path: pathlib.Path
    ) -> None:
        stub = _make_stub(tmp_path, self.CLAUDE_LINES)
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="CL=F",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["strategy_id"] == "new_s1"
        assert record.result["run_id"] == "run-7"
        # 整形済みログが流れ、生 JSON はログに載らない
        _, lines = manager.log_since(job.job_id, 0)
        joined = "\n".join(lines)
        assert "working" in joined
        assert '"type": "system"' not in joined

    async def test_agent_job_backfills_strategy_id(
        self, tmp_path: pathlib.Path
    ) -> None:
        """WHY: 起動時は戦略が未存在のため strategy_id="" で作る。完了時に
        結果から書き戻さないと、ジョブ一覧でどの戦略を作ったのか辿れない。"""
        stub = _make_stub(tmp_path, self.CLAUDE_LINES)
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="CL=F",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.strategy_id == "new_s1"

    async def test_agent_job_runs_in_forge_dir(self, tmp_path: pathlib.Path) -> None:
        """WHY: cwd がワークスペースでないと、エージェントの相対パス操作が
        サーバー起動ディレクトリを汚す（権限モデルの前提が崩れる）。"""
        stub = _make_stub(tmp_path, "pwd > cwd-marker.txt\n")
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        await manager.wait_terminal(job.job_id, timeout=10)
        marker = tmp_path / "cwd-marker.txt"
        assert marker.exists()
        assert marker.read_text().strip() == str(tmp_path.resolve())

    async def test_agent_cli_not_found_fails_with_guidance(
        self, tmp_path: pathlib.Path
    ) -> None:
        manager = _agent_manager(tmp_path, None)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None and "claude" in record.error

    async def test_agent_login_failure_is_translated(
        self, tmp_path: pathlib.Path
    ) -> None:
        stub = _make_stub(
            tmp_path, 'echo "Invalid API key. Please run /login" >&2\nexit 1\n'
        )
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None
        assert "ログイン" in record.error or "log in" in record.error

    async def test_forge_jobs_are_unaffected(self, tmp_path: pathlib.Path) -> None:
        """回帰ガード: 既存 forge ジョブの stdout=結果 JSON 契約は不変。"""
        stub = _make_stub(tmp_path, 'printf \'{"run_id": "r1"}\'\n')
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "succeeded"
        assert record.result == {"run_id": "r1"}
```

- [ ] **Step 2: 失敗を確認**

Run: `uv run pytest tests/services/test_jobs.py -q`
Expected: FAIL（`create()` が `goal` を受けない / `agent_resolver` 未定義）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/services/jobs.py` を変更する。変更点は 6 箇所:

1. import に追加:

```python
from alpha_visualizer.services.agent_cli import (
    AGENT_NOT_FOUND_MESSAGES,
    AgentBackend,
    build_agent_argv,
    resolve_agent_exe,
    translate_agent_failure,
)
from alpha_visualizer.services.agent_events import extract_final_text, format_agent_event
```

2. 型と定数（`JobKind` の行を置換、定数を追記）:

```python
JobKind = Literal["backtest", "optimize", "wft", "agent"]

DEFAULT_AGENT_TIMEOUT_SEC = 1800
AGENT_TIMEOUT_ENV = "ALPHA_VIS_AGENT_TIMEOUT"
```

3. `JobRecord` にフィールド追加（`strategy_file` の下）:

```python
    # agent ジョブ（AI 戦略開発）専用。forge ジョブでは常に None。
    goal: str | None = None
    backend: str | None = None
    prompt: str | None = None
```

4. `JobManager.__init__` に引数とフィールドを追加:

```python
        agent_resolver: Callable[[AgentBackend], str | None] = resolve_agent_exe,
        agent_timeout_sec: int | None = None,
```

```python
        self._agent_resolver = agent_resolver
        self._agent_timeout_sec = agent_timeout_sec or _env_int(
            AGENT_TIMEOUT_ENV, DEFAULT_AGENT_TIMEOUT_SEC
        )
```

5. `create()` にキーワード引数 `goal: str | None = None, backend: str | None = None, prompt: str | None = None` を追加し、`JobRecord(...)` へ素通しする。

6. `_execute()` を kind 分岐に対応させる。冒頭の forge 固定部分を次の構造に置き換える:

```python
    async def _execute(self, record: JobRecord) -> None:
        stdout_line_handler: Callable[[str], str | None] | None = None
        cwd: str | None = None
        if record.kind == "agent":
            backend: AgentBackend = "codex" if record.backend == "codex" else "claude"
            exe = self._agent_resolver(backend)
            if exe is None:
                await self._finish(
                    record, "failed", error=AGENT_NOT_FOUND_MESSAGES[backend]
                )
                return
            argv = build_agent_argv(exe, backend, record.prompt or "")
            timeout_sec = self._agent_timeout_sec
            # エージェントの相対パス操作をワークスペース内に固定する（権限モデル）
            cwd = str(self._forge_config.forge_dir)
            stdout_line_handler = lambda line: format_agent_event(backend, line)  # noqa: E731
        else:
            forge_exe = self._forge_resolver()
            if forge_exe is None:
                await self._finish(record, "failed", error=FORGE_NOT_FOUND_MESSAGE)
                return
            argv = build_argv(
                forge_exe,
                record.kind,
                record.strategy_id,
                record.symbol,
                record.trials,
                record.windows,
                strategy_file=record.strategy_file,
            )
            timeout_sec = self._timeout_sec
```

`create_subprocess_exec(...)` に `cwd=cwd` を追加。`asyncio.wait_for(proc.wait(), timeout=self._timeout_sec)` は `timeout=timeout_sec` に変更（タイムアウト時のエラーメッセージ内の `self._timeout_sec` も同様）。

`_pump_stdout` を、バッファリングに加えて行分割ハンドラを呼べるよう変更する（`_pump_stderr` と同じチャンク分割方式。ハンドラが None を返した行はログに載せない）:

```python
        async def _pump_stdout() -> None:
            assert proc.stdout is not None
            buf = b""
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    if buf and stdout_line_handler is not None:
                        formatted = stdout_line_handler(
                            buf.decode("utf-8", errors="replace")
                        )
                        if formatted is not None:
                            await self._append_log(record, formatted)
                    return
                if len(stdout_buf) < STDOUT_MAX_BYTES:
                    stdout_buf.extend(chunk)
                if stdout_line_handler is None:
                    continue
                buf += chunk
                *complete, buf = buf.split(b"\n")
                for raw in complete:
                    formatted = stdout_line_handler(
                        raw.decode("utf-8", errors="replace")
                    )
                    if formatted is not None:
                        await self._append_log(record, formatted)
```

終了処理（`proc.returncode != 0` と成功パス）を kind 分岐にする:

```python
        if proc.returncode != 0:
            _, tail = self.log_since(record.job_id, max(0, record.log_seq - 5))
            log_text = "\n".join(tail)
            if record.kind == "agent":
                backend = "codex" if record.backend == "codex" else "claude"
                error = (
                    translate_agent_failure(backend, stdout_text, log_text)
                    or log_text
                    or "エージェントの実行に失敗しました / Agent execution failed"
                )
            else:
                error = (
                    translate_forge_failure(stdout_text, log_text)
                    or log_text
                    or "ジョブの実行に失敗しました / Job execution failed"
                )
            await self._finish(
                record, "failed", returncode=proc.returncode, error=error
            )
            return

        if record.kind == "agent":
            backend = "codex" if record.backend == "codex" else "claude"
            final_text = extract_final_text(backend, stdout_text)
            data = parse_json_lenient(final_text) if final_text else None
            result = _compact_result(data) if data is not None else None
            # ジョブ一覧から生成物へ辿れるよう、判明した strategy_id を書き戻す
            if result is not None and isinstance(result.get("strategy_id"), str):
                record.strategy_id = result["strategy_id"]
            await self._finish(record, "succeeded", returncode=0, result=result)
            return

        data = parse_json_lenient(stdout_text)
        result = _compact_result(data) if data is not None else None
        await self._finish(record, "succeeded", returncode=0, result=result)
```

（stderr は従来どおり全行ログへ。エージェント CLI の診断出力を拾うため変更しない。）

- [ ] **Step 4: テストが通ることを確認（既存回帰含む全件）**

Run: `uv run pytest tests/services/test_jobs.py tests/routers/test_jobs.py -q`
Expected: PASS（既存の forge ジョブテストも全部通ること）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/services/jobs.py tests/services/test_jobs.py
git commit -m "feat: JobManager に agent ジョブ種を追加"
```

---

### Task 7: API 層 — `schemas/agent.py` + `routers/agent.py` + 配線

**Files:**
- Create: `src/alpha_visualizer/schemas/agent.py`
- Create: `src/alpha_visualizer/routers/agent.py`
- Modify: `src/alpha_visualizer/app.py`（import 2 行 + `create_app` 引数 + state + include_router）
- Modify: `src/alpha_visualizer/cli.py`（非 loopback 分岐で `agent_enabled=False`）
- Test: `tests/routers/test_agent.py`

**Interfaces:**
- Consumes: Task 2 の例外、Task 3 の `resolve_agent_exe` / `agent_version` / `AGENT_NOT_FOUND_MESSAGES`、Task 4 の `build_agent_prompt`、Task 6 の `JobManager.create(kind="agent", ...)`、既存 `routers/jobs.py` の `JobSummary` / `_to_summary`、`services/forge_cli.py` の `resolve_forge_exe` / `FORGE_NOT_FOUND_MESSAGE`
- Produces:
  - `GET /api/agent/backends` → `AgentBackendsResponse {enabled: bool, backends: [{id, available, version}]}`
  - `POST /api/agent/jobs` → 202 `JobSummary`（既存 `/api/jobs/{id}` 系で観察）
  - `create_app(..., agent_enabled: bool = True)` と `app.state.agent_enabled`

- [ ] **Step 1: 失敗するテストを書く**

`tests/routers/test_agent.py` を新規作成（フィクスチャは `tests/routers/test_jobs.py` の様式を踏襲）:

```python
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
```

- [ ] **Step 2: 失敗を確認**

Run: `uv run pytest tests/routers/test_agent.py -q`
Expected: FAIL（`create_app` が `agent_enabled` を受けない）

- [ ] **Step 3: スキーマを実装**

`src/alpha_visualizer/schemas/agent.py` を新規作成:

```python
"""AI 戦略開発（agent）API の Pydantic スキーマ。

OpenAPI 経由でフロント TS 型が自動生成される（ADR-0003）。変更したら
``cd frontend && pnpm run gen`` を忘れないこと。
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentBackendInfo(BaseModel):
    """エージェントバックエンド 1 件の検出結果。"""

    id: Literal["claude", "codex"]
    available: bool
    version: str | None


class AgentBackendsResponse(BaseModel):
    """検出結果と機能の有効状態。enabled=False は非 loopback 公開中。"""

    enabled: bool
    backends: list[AgentBackendInfo]


class CreateAgentJobRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    goal: str = Field(min_length=1, max_length=4000)
    # /api/jobs と同様、境界でシンボル形式を制限する（argv 素通し防止）
    symbol: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9=.^_-]+$"
    )
    backend: Literal["claude", "codex"]
```

- [ ] **Step 4: ルーターを実装**

`src/alpha_visualizer/routers/agent.py` を新規作成:

```python
"""AI 戦略開発（Agent Develop）API ルーター。

- ``GET /api/agent/backends`` → claude / codex の検出結果と機能有効状態
- ``POST /api/agent/jobs`` → 202 + JobSummary（観察・キャンセルは既存 /api/jobs 系）

設計: docs/superpowers/specs/2026-08-02-agent-develop-design.md
"""
from __future__ import annotations

from typing import Annotated, get_args

from fastapi import APIRouter, Depends, Request

from alpha_visualizer.dependencies import get_forge_config_dep, get_job_manager
from alpha_visualizer.errors import (
    AgentCliNotFoundError,
    AgentDisabledError,
    ForgeCliNotFoundError,
)
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers.jobs import JobSummary, _to_summary
from alpha_visualizer.schemas.agent import (
    AgentBackendInfo,
    AgentBackendsResponse,
    CreateAgentJobRequest,
)
from alpha_visualizer.services.agent_cli import (
    AGENT_NOT_FOUND_MESSAGES,
    AgentBackend,
    agent_version,
    resolve_agent_exe,
)
from alpha_visualizer.services.agent_prompt import build_agent_prompt
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    resolve_forge_exe,
)
from alpha_visualizer.services.jobs import JobManager

router = APIRouter()

AGENT_DISABLED_MESSAGE = (
    "AI 戦略開発は localhost でのみ利用できます（LAN 公開中は無効）"
    " / Agent development is only available on localhost"
)


@router.get("/agent/backends", response_model=AgentBackendsResponse)
async def list_agent_backends(request: Request) -> AgentBackendsResponse:
    """エージェントバックエンドの検出結果を返す（GUI の選択肢構築用）。"""
    backends: list[AgentBackendInfo] = []
    for backend in get_args(AgentBackend):
        exe = resolve_agent_exe(backend)
        version = await agent_version(exe) if exe is not None else None
        backends.append(
            AgentBackendInfo(id=backend, available=exe is not None, version=version)
        )
    return AgentBackendsResponse(
        enabled=bool(request.app.state.agent_enabled), backends=backends
    )


@router.post("/agent/jobs", response_model=JobSummary, status_code=202)
async def create_agent_job(
    body: CreateAgentJobRequest,
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
    cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> JobSummary:
    """クイック戦略開発ジョブを起動する。

    実行前に「機能有効・forge 導入済み・agent CLI 導入済み」を確認して
    fail-fast する（エージェント起動後に判明すると原因がログの奥に埋まる）。
    """
    if not request.app.state.agent_enabled:
        raise AgentDisabledError(AGENT_DISABLED_MESSAGE)
    if resolve_forge_exe() is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)
    if resolve_agent_exe(body.backend) is None:
        raise AgentCliNotFoundError(AGENT_NOT_FOUND_MESSAGES[body.backend])

    prompt = build_agent_prompt(
        goal=body.goal, symbol=body.symbol, strategies_dir=cfg.strategies_dir
    )
    record = await manager.create(
        kind="agent",
        strategy_id="",  # 生成物の id はジョブ完了時に判明し書き戻される
        symbol=body.symbol or "",
        goal=body.goal,
        backend=body.backend,
        prompt=prompt,
    )
    return _to_summary(record)
```

補足: `routers/jobs.py` の `_to_summary` を import するため、`jobs.py` 側の名前は変更しない（既に module-level 関数）。

- [ ] **Step 5: app.py / cli.py を配線**

`src/alpha_visualizer/app.py`:
- import 追加: `from alpha_visualizer.routers import agent as agent_router`
- `create_app` シグネチャに `agent_enabled: bool = True` を追加（`allowed_hosts` の後ろ）し、docstring に 1 行追記
- `app.state.run_semaphore = run_semaphore` の下に `app.state.agent_enabled = agent_enabled`
- `app.include_router(maintenance_router.router, prefix="/api")` の下に `app.include_router(agent_router.router, prefix="/api")`

`src/alpha_visualizer/cli.py` の serve 実装（`create_app(config=config, allowed_hosts=["*"])` の行）を:

```python
        # 非 loopback 公開時はエージェント起動（任意コード実行に近い）を無効化する
        app = create_app(config=config, allowed_hosts=["*"], agent_enabled=False)
```

loopback 分岐は既定値 True のため変更不要。

- [ ] **Step 6: テストが通ることを確認**

Run: `uv run pytest tests/routers/test_agent.py tests/test_app.py tests/test_cli.py -q`
Expected: PASS（test_cli.py の serve 系 2 件はポート 8000 占有時のみ失敗する既知事象）

- [ ] **Step 7: コミット**

```bash
git add src/alpha_visualizer/schemas/agent.py src/alpha_visualizer/routers/agent.py \
        src/alpha_visualizer/app.py src/alpha_visualizer/cli.py tests/routers/test_agent.py
git commit -m "feat: AI 戦略開発 API（/api/agent/*）を追加"
```

---

### Task 8: OpenAPI 型の再生成

**Files:**
- Modify: `frontend/openapi.json` / `frontend/src/api/types.gen.ts`（自動生成）

- [ ] **Step 1: 再生成**

Run: `cd frontend && pnpm run gen`
Expected: `openapi.json` と `types.gen.ts` に `AgentBackendsResponse` / `CreateAgentJobRequest` 等が追加される（`git diff --stat` で確認）

- [ ] **Step 2: コミット**

```bash
git add frontend/openapi.json frontend/src/api/types.gen.ts
git commit -m "chore: agent API の OpenAPI 型を再生成"
```

---

### Task 9: フロントエンド API クライアントとフック

**Files:**
- Modify: `frontend/src/api/types.ts`（型 alias 追加。既存 alias の書式に合わせる）
- Modify: `frontend/src/api/client.ts`（`api` オブジェクトへ 2 メソッド追加）
- Modify: `frontend/src/hooks/useJobRunner.ts`（作成関数を注入可能にし `useAgentRunner` を追加）
- Create: `frontend/src/hooks/useAgentBackends.ts`
- Test: `frontend/src/hooks/__tests__/useAgentRunner.test.ts`、`frontend/src/hooks/__tests__/useAgentBackends.test.ts`（既存の hooks テストの様式・モック方法を踏襲）

**Interfaces:**
- Consumes: Task 8 の生成型（`types.gen.ts`）
- Produces:
  - `api.getAgentBackends(): Promise<AgentBackendsResponse>`
  - `api.createAgentJob(params: CreateAgentJobParams): Promise<JobSummary>`
  - `useAgentRunner(onFinished?): UseJobRunnerResult`（`start` の引数型だけ `CreateAgentJobParams`）
  - `useAgentBackends(): { data: AgentBackendsResponse | null; loading: boolean }`

- [ ] **Step 1: 失敗するテストを書く**

`useAgentRunner.test.ts`: 既存 `useJobRunner` テスト（あれば）の様式で、`api.createAgentJob` をモックし「start が `/api/agent/jobs` 相当の作成関数を呼び、SSE の status イベントで finish する」ことを検証。`useAgentBackends.test.ts`: fetch モックで「マウント時に 1 回だけ取得し、失敗時は `data: null, loading: false`（= 無効扱い）へ落ちる」ことを検証。

```typescript
// useAgentBackends.test.ts の核（既存テストの renderHook 様式に合わせる）
it('取得失敗時は data=null で loading が終わる', async () => {
  // WHY: backends API が落ちても GUI 全体は動き続け、開発ビューだけが
  // 非表示になるのが正しい縮退（画面全体をエラーにしない）
  vi.spyOn(api, 'getAgentBackends').mockRejectedValue(new Error('boom'))
  const { result } = renderHook(() => useAgentBackends())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.data).toBeNull()
})
```

- [ ] **Step 2: 失敗を確認**

Run: `cd frontend && pnpm exec vitest run src/hooks/__tests__/useAgentBackends.test.ts src/hooks/__tests__/useAgentRunner.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`types.ts` に追記（既存 alias 群と同じ書式で `types.gen.ts` から引く）:

```typescript
export type AgentBackendsResponse =
  components['schemas']['AgentBackendsResponse']
export type CreateAgentJobParams =
  components['schemas']['CreateAgentJobRequest']
```

（`components` の import 名・書式は既存の `CreateJobParams` の定義行をそのまま踏襲する。）

`client.ts` の `api` オブジェクトに、既存 `createJob` / `getJob` と同じ書式で追加:

```typescript
  getAgentBackends: (): Promise<AgentBackendsResponse> =>
    request('/api/agent/backends'),
  createAgentJob: (params: CreateAgentJobParams): Promise<JobSummary> =>
    request('/api/agent/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
```

（`createJob` の実装行を開き、ヘッダー付与の実際の書式に合わせること。）

`useJobRunner.ts`: `start` 内の `api.createJob(params)` 呼び出しを注入可能にする。内部実装を `useJobRunnerCore<P>(createFn: (p: P) => Promise<JobSummary>, onFinished?)` に切り出し:

```typescript
export function useJobRunner(
  onFinished?: (status: JobStatus) => void,
): UseJobRunnerResult {
  return useJobRunnerCore(api.createJob, onFinished)
}

export function useAgentRunner(
  onFinished?: (status: JobStatus) => void,
): UseJobRunnerResult<CreateAgentJobParams> {
  return useJobRunnerCore(api.createAgentJob, onFinished)
}
```

`UseJobRunnerResult` はジェネリクス化（`UseJobRunnerResult<P = CreateJobParams>` で `start: (params: P) => Promise<boolean>`）。SSE 購読・ポーリングフォールバック・キャンセルのロジックは一切変更しない。

`useAgentBackends.ts` を新規作成:

```typescript
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AgentBackendsResponse } from '../api/types'

/**
 * AI 戦略開発バックエンド（claude / codex）の検出結果を 1 回だけ取得する。
 * 失敗時は data=null（= 機能非表示の縮退）。GUI 全体は巻き込まない。
 */
export function useAgentBackends(): {
  data: AgentBackendsResponse | null
  loading: boolean
} {
  const [data, setData] = useState<AgentBackendsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    api
      .getAgentBackends()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { data, loading }
}
```

- [ ] **Step 4: テスト・型・Lint を確認**

Run: `cd frontend && pnpm exec vitest run && pnpm run lint && pnpm run build`
Expected: 全 PASS（`tsc --noEmit` は no-op のため build が型ゲート）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts \
        frontend/src/hooks/useJobRunner.ts frontend/src/hooks/useAgentBackends.ts \
        frontend/src/hooks/__tests__/
git commit -m "feat: agent API クライアントと useAgentRunner/useAgentBackends を追加"
```

---

### Task 10: 「開発」ビュー（DevelopScreen / DevelopPage / ナビ / ルート）

**Files:**
- Create: `frontend/src/screens/DevelopScreen.tsx`（Presentational）
- Create: `frontend/src/pages/DevelopPage.tsx`（Container）
- Modify: `frontend/src/router.tsx`（`/develop` ルート追加）
- Modify: `frontend/src/components/AppNav.tsx`（`showDevelop` prop で項目を条件表示）
- Modify: `frontend/src/components/RootLayout.tsx`（`useAgentBackends` の結果を AppNav へ）
- Test: `frontend/src/screens/__tests__/DevelopScreen.test.tsx`、`frontend/src/pages/__tests__/DevelopPage.test.tsx`（既存の pages/screens テストの様式を踏襲）
- Create: `frontend/src/screens/DevelopScreen.stories.tsx`（既存 `*Screen.stories.tsx` の様式）

**Interfaces:**
- Consumes: Task 9 の `useAgentRunner` / `useAgentBackends`、`i18n/strings.ts` の `Lang` / `makeL`
- Produces: `DevelopScreen` props:

```typescript
export interface DevelopScreenProps {
  lang: Lang
  backends: AgentBackendsResponse | null
  running: boolean
  status: JobStatus | null
  logLines: string[]
  result: Record<string, unknown> | null
  error: string | null
  onStart: (goal: string, symbol: string, backend: 'claude' | 'codex') => void
  onCancel: () => void
}
```

- [ ] **Step 1: 失敗するテストを書く（Screen）**

`DevelopScreen.test.tsx` の検証項目（既存 Screen テストの render 様式で実装）:

1. `backends.enabled === false` → 「localhost でのみ利用できます」案内が出てフォームが出ない
2. 両バックエンド `available: false` → 導入案内カード（claude / codex それぞれの導入 URL リンク）が出る
3. `available: true` のバックエンドだけが選択肢に出る
4. ゴール未入力で開始ボタンが disabled（WHY: 空ゴールはサーバーで 422 になるだけの無駄往復）
5. `running: true` → ログ領域（`logLines` の内容）とキャンセルボタンが出る
6. `result.strategy_id` があるとき → `/detail/<strategy_id>` へのリンクが出る（WHY: 結果反映が本機能の完了条件）
7. 日英切り替え（`lang: 'ja' | 'en'` の両方でラベルが出る）

- [ ] **Step 2: 失敗を確認**

Run: `cd frontend && pnpm exec vitest run src/screens/__tests__/DevelopScreen.test.tsx`
Expected: FAIL

- [ ] **Step 3: DevelopScreen を実装**

構成（既存 Screen の design primitives・`var(--...)` トークンの使い方を踏襲）:

- ヘッダ: タイトル `L('AI 戦略開発', 'Agent Develop')` + 説明 1 行（「ローカルの Claude Code / Codex CLI を使って戦略を自動開発します。CLI は外部（Anthropic / OpenAI）と通信します」の日英）
- `!backends || !backends.enabled` → 案内のみ: `L('この機能は localhost でのみ利用できます', 'This feature is only available on localhost')`
- 両方 `available: false` → 導入案内カード（`AGENT_NOT_FOUND` 相当の文言 + リンク `https://claude.com/claude-code` / `https://developers.openai.com/codex/cli`）
- フォーム: ゴール（`<textarea>`・必須）、銘柄（`<input>`・任意・placeholder `CL=F`）、バックエンド（`<select>`・available のみ・version 併記）、開始ボタン
- 実行中: ログ表示（`<pre>` 相当のスクロール領域・`logLines.join('\n')`）+ キャンセルボタン（既存 `ConfirmActionButton` があるので流用可否を確認）
- 完了: succeeded かつ `result?.strategy_id` → `react-router` の `Link` で `/detail/${result.strategy_id}` へ。succeeded だが result なし → `L('完了しましたが結果を特定できませんでした。ログを確認してください', 'Finished, but the result could not be determined. Check the log.')`。failed → `error` を表示

- [ ] **Step 4: DevelopPage / router / AppNav / RootLayout を実装**

`DevelopPage.tsx`（Container。lang の取得方法は `LivePage.tsx` の先頭を読み、同じ方法を使う）:

```tsx
export function DevelopPage() {
  const lang = /* LivePage と同じ取得方法 */
  const { data: backends } = useAgentBackends()
  const runner = useAgentRunner()
  return (
    <DevelopScreen
      lang={lang}
      backends={backends}
      running={runner.running}
      status={runner.status}
      logLines={runner.logLines}
      result={runner.result}
      error={runner.error}
      onStart={(goal, symbol, backend) =>
        void runner.start({ goal, symbol: symbol || null, backend })
      }
      onCancel={() => void runner.cancel()}
    />
  )
}
```

`router.tsx`: `/live` の下に追加:

```tsx
      {
        path: '/develop',
        element: lazyRoute(() => import('./pages/DevelopPage'), 'DevelopPage'),
      },
```

`AppNav.tsx`: `ITEMS` から develop を分離し、prop で条件表示:

```tsx
const DEVELOP_ITEM: NavItem = { to: '/develop', ja: '開発', en: 'Develop' }

export function AppNav({ lang, showDevelop = false }: { lang: Lang; showDevelop?: boolean }) {
  const items = showDevelop
    ? [...ITEMS.slice(0, 5), DEVELOP_ITEM, ...ITEMS.slice(5)]  // ライブの後・整理の前
    : ITEMS
  ...
}
```

`RootLayout.tsx`: `useAgentBackends()` を呼び、`<AppNav lang={...} showDevelop={data?.enabled ?? false} />` へ渡す（RootLayout の実装を読み、AppNav 呼び出し箇所だけを変更）。
直接 URL で `/develop` を開いた場合は DevelopPage 側の `enabled` ガードが案内を出す（ナビ非表示だけに頼らない）。

- [ ] **Step 5: テスト・Lint・ビルドを確認**

Run: `cd frontend && pnpm exec vitest run && pnpm run lint && pnpm run build`
Expected: 全 PASS（vitest thresholds 維持）

- [ ] **Step 6: コミット**

```bash
git add frontend/src/screens/DevelopScreen.tsx frontend/src/screens/DevelopScreen.stories.tsx \
        frontend/src/pages/DevelopPage.tsx frontend/src/router.tsx \
        frontend/src/components/AppNav.tsx frontend/src/components/RootLayout.tsx \
        frontend/src/screens/__tests__/ frontend/src/pages/__tests__/
git commit -m "feat: 開発ビュー（AI 戦略開発）を追加"
```

---

### Task 11: ドキュメント（README 日英・spec 整合・スクリーンショット）

**Files:**
- Modify: `README.md` / `README.en.md`
- Modify: `docs/superpowers/specs/2026-08-02-agent-develop-design.md`（424 → 503 の整合）
- Modify: `frontend/e2e/screenshots/capture.spec.ts`（develop ビューの撮影追加）
- Modify: `docs/screenshots/{ja,en}/*.png`（再生成）

- [ ] **Step 1: README 追記（日英同時）**

両 README の機能一覧・スクリーンショット節の様式に合わせて「AI 戦略開発（Agent Develop）」節を追加。必須記載事項:
1. ゴールを入力するとローカルの Claude Code / Codex CLI がヘッドレスで戦略を開発すること
2. **本機能はユーザー自身の CLI を起動し、CLI は外部（Anthropic / OpenAI）と通信する**こと
3. 権限モデル（ワークスペース限定・許可ツール絞り・localhost 限定）
4. 前提条件（`claude` または `codex` が PATH にあり認証済み・`alpha-forge` 導入済み）
5. タイムアウト環境変数 `ALPHA_VIS_AGENT_TIMEOUT`（既定 1800 秒）

- [ ] **Step 2: spec の 424 記述を 503 に修正**

spec 内の「424」を全箇所（エラー処理表・データフロー節）で「503（`agent_cli_not_found` / `forge_cli_not_found` code 付き。既存 `ForgeCliNotFoundError` 規約に準拠）」へ更新。

- [ ] **Step 3: スクリーンショット撮影を追加・再生成**

`capture.spec.ts` に develop ビューの撮影を追加。フィクスチャサーバーに `/api/agent/backends` が無いため、既存テストの様式で `page.route('**/api/agent/backends', ...)` により `{"enabled": true, "backends": [{"id": "claude", "available": true, "version": "1.0.0"}, {"id": "codex", "available": true, "version": "0.75.0"}]}` をモックしてフォーム表示状態を撮る（ja / en 両方）。

Run: `cd frontend && pnpm run screenshots`
Expected: `docs/screenshots/{ja,en}/` に develop の PNG が追加され、既存分も再生成される

- [ ] **Step 4: コミット**

```bash
git add README.md README.en.md docs/superpowers/specs/2026-08-02-agent-develop-design.md \
        frontend/e2e/screenshots/capture.spec.ts docs/screenshots/
git commit -m "docs: AI 戦略開発機能のドキュメントとスクリーンショットを追加"
```

---

### Task 12: フルゲート検証・実機スモーク・PR 作成

**Files:** なし（検証と PR のみ。修正が出た場合は該当タスクの様式で追補コミット）

- [ ] **Step 1: バックエンドのフルゲート**

Run:
```bash
uv run pytest tests/ -q
uv run ruff check src/ tests/
uv run mypy src/
```
Expected: pytest 全 PASS（serve 系 2 件はポート 8000 占有時のみ失敗する既知事象。占有時は deselect し、除外した事実を PR に明記）、ruff / mypy エラー 0。カバレッジ 90% を下回ったら不足箇所にテスト追補。

- [ ] **Step 2: フロントエンドのフルゲート**

Run: `cd frontend && pnpm run gen && git diff --exit-code openapi.json src/api/types.gen.ts && pnpm exec vitest run && pnpm run lint && pnpm run build`
Expected: 生成物 drift なし・全 PASS

- [ ] **Step 3: 実機スモーク（claude 1 回・codex 1 回）**

使い捨てワークスペースで実走する（**実ワークスペース `alpha-strategies` は使わない**）:

```bash
SMOKE=$(mktemp -d)/ws && mkdir -p "$SMOKE" && cd "$SMOKE"
ALPHA_FORGE_DEV_SKIP_LICENSE=1 alpha-forge system init
cd - && cd frontend && pnpm run build && cd ..
uv run alpha-vis serve --forge-dir "$SMOKE" --port 8130 &
sleep 2
curl -s http://127.0.0.1:8130/api/agent/backends   # 両方 available を確認
curl -s -X POST http://127.0.0.1:8130/api/agent/jobs \
  -H 'Content-Type: application/json' \
  -d '{"goal": "Create the simplest possible SMA crossover strategy", "symbol": "AAPL", "backend": "claude"}'
# 返った job_id で: curl -N http://127.0.0.1:8130/api/jobs/<job_id>/events
```
Expected: ジョブが succeeded になり `result.strategy_id` / `result.run_id` が入る。ブラウザで http://127.0.0.1:8130/develop も目視（ナビに「開発」が出る・ログが流れる）。backend を codex に変えて同様に 1 回。完了後にサーバーを停止し `$SMOKE` を削除。
数分・少額の API 消費が発生する。失敗した場合は原因を特定して該当タスクに戻る（スモーク省略でリリースしない — Fail Loud）。

- [ ] **Step 4: Issue と PR を作成**

visualizer の issue は alforge-labs org 側リポジトリに起票する運用。

```bash
gh issue create --title "feat: GUI からの AI 戦略開発（Agent Develop v1）" \
  --body-file <(spec の「背景と目的」「v1 スコープ」を要約したファイル)
git push -u origin worktree-agent-develop
gh pr create --title "feat: AI 戦略開発（Agent Develop）v1" --body-file <PR本文ファイル>
```
PR 本文（`--body-file` 必須・インライン `--body` 禁止）: 概要 / 変更内容 / セキュリティ設計（権限モデル・localhost 限定・キー不使用）/ 検証結果（ゲート・実機スモークの実測値）/ `Closes #<issue番号>` / スクリーンショット。

---

### Task 13: alforge-labs ドキュメント同期（別リポジトリ・リンク PR）

**Files:**（`alforge-labs` リポジトリ側。このリポジトリの PR とは別のリンク PR）
- Modify: `alforge-labs/mkdocs_src/{ja,en}/alpha-visualizer/` の対応ページ
- Modify: mkdocs ビルド成果物（`ja/docs/` 等）

- [ ] **Step 1: ページ追記**

alpha-visualizer の機能ページに「AI 戦略開発」節を日英で追加（内容は Task 11 の README と同等。API エンドポイント・権限モデル・localhost 限定・外部通信の明示）。

- [ ] **Step 2: ビルド成果物を再生成してコミット**

Run: `cd alforge-labs && uv run mkdocs build -f mkdocs.ja.yml`（英語版設定があれば同様に）
Expected: 成果物が再生成される。ソースと成果物を同一コミットに含め、visualizer PR と相互リンクする PR を作成。

---

## Self-Review 済み事項

- spec の全要件 → タスク対応: 決定事項テーブル（Task 3, 7, 10）・CLI 起動仕様（Task 1, 3）・セキュリティ 5 項目（Task 3, 7, 10, 11）・データフロー（Task 6, 7, 9, 10)・エラー処理表（Task 2, 3, 6, 7, 10）・テスト戦略（各タスク + Task 12）・ドキュメント（Task 8, 11, 13）・スコープ外の混入なし
- 逸脱 1 件（424 → 503）は冒頭に明記し Task 11 で spec を修正
- 型整合: `AgentBackend` / `build_agent_argv` / `format_agent_event` / `extract_final_text` / `create(goal=, backend=, prompt=)` / `AgentBackendsResponse` / `CreateAgentJobParams` の名前・シグネチャはタスク間で一致
