"""エージェント CLI（claude / codex）呼び出しの共有ヘルパー。

``forge_cli.py`` と対になるモジュール。検出・argv 構築・失敗変換のみを担い、
プロセス起動そのものは ``services/jobs.py`` の責務。
設計: docs/superpowers/specs/2026-08-02-agent-develop-design.md
"""
from __future__ import annotations

import asyncio
import contextlib
import pathlib
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

# 認証切れの stderr/stdout に現れる語。login への導線に変換する。
# バックエンドごとに分けるのは、CLI ごとに文言が違ううえ、共通語彙で判定すると
# 一方の失敗にもう一方固有の語が混ざったときに誤った復旧手順を案内するため。
# 素の "/login" は使わない: エージェントが書いたパス（src/routes/login.ts 等）に
# 現れて、本当の失敗原因を認証案内で置き換えてしまう。
_LOGIN_MARKERS: dict[AgentBackend, tuple[str, ...]] = {
    "claude": ("run /login", "invalid api key", "not logged in"),
    "codex": ("codex login", "not logged in", "invalid api key"),
}

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

# エージェントのターン上限（claude のみ。codex exec に相当フラグは無い）。
#
# 既定値の根拠: 実測で 1 ターンあたり約 17 秒（探索的なゴールで 14 分 / 50 ターン）。
# 既定タイムアウト DEFAULT_AGENT_TIMEOUT_SEC = 1800 秒はおよそ 100 ターン相当に
# あたるため、両方の安全網がほぼ同時に効く 100 を既定とする。旧既定の 50 は
# 「バックテストを何度も回して改善する」ゴールでは途中で切れることが実運用で
# 判明した（15 回のバックテストを終えた時点で上限に到達した）。
DEFAULT_CLAUDE_MAX_TURNS = 100
# GUI / API から指定できる上限。タイムアウトが先に効くため実質の上限では
# ないが、極端な値で暴走時の課金が膨らむのを防ぐ
MAX_CLAUDE_MAX_TURNS = 500

# ターン上限に達して打ち切られたときの案内。原因（上限到達）と次の一歩
# （分割 / 上限引き上げ）の両方を必ず含める
AGENT_MAX_TURNS_MESSAGE = (
    "エージェントがターン上限（{limit}）に達したため中断しました。"
    "ゴールをより小さく分けるか、ターン上限を上げて再実行してください"
    " / Agent stopped after reaching its turn limit ({limit})."
    " Split the goal into smaller steps, or raise the turn limit and retry."
)


def _workspace_rule_path(workspace: pathlib.Path) -> str:
    """Claude Code の permission rule 用の絶対パスパターンを作る。

    ルート起点の絶対パスは ``//`` プレフィックスで書く規約（例:
    ``//Users/alice/ws/**``）。実パスは先頭に ``/`` を含むため重複を除く。
    """
    return "//" + str(workspace).lstrip("/") + "/**"


def build_claude_allowed_tools(workspace: pathlib.Path) -> str:
    """ワークスペース配下に限定した allowedTools 文字列を組む（権限モデルの本体）。

    - ファイル読み書きはパススコープ付きにする。cwd 固定とプロンプト指示だけ
      では、絶対パスを使う操作をワークスペース内に閉じ込められない
    - 編集側は ``Edit(...)`` で表す。``Edit`` ルールはファイルを編集する
      ビルトインツール全体（Write / NotebookEdit を含む）に適用される一方、
      ``Write(path)`` 形式はファイルパーミッション判定の対象外で効かない
    - ``Read`` ルールはファイルを読むビルトインツール全体に適用されるため、
      探索用の Glob / Grep はツール名のみ許可すれば読み取り範囲も従う
    - Bash は alpha-forge CLI のみ（設計の権限モデル）
    """
    scope = _workspace_rule_path(workspace)
    return ",".join(
        [
            f"Read({scope})",
            f"Edit({scope})",
            "Glob",
            "Grep",
            "Bash(alpha-forge *)",
        ]
    )

VERSION_TIMEOUT_SEC = 5
# kill 後に子プロセスを回収する待ち時間（回収できなくても検出は続行する）
KILL_WAIT_SEC = 1.0


def resolve_agent_exe(backend: AgentBackend) -> str | None:
    """PATH 上のエージェント CLI を解決する（無ければ None）。"""
    return shutil.which(AGENT_EXE_NAMES[backend])


def build_agent_argv(
    exe: str,
    backend: AgentBackend,
    prompt: str,
    workspace: pathlib.Path,
    max_turns: int = DEFAULT_CLAUDE_MAX_TURNS,
) -> list[str]:
    """backend に応じたヘッドレス実行 argv を構築する。

    作業ディレクトリは呼び出し側が subprocess の ``cwd`` で ``workspace`` に
    固定する前提（-C / --add-dir はここでは渡さない）。``workspace`` は
    claude のツール許可のスコープにも使う（codex は OS サンドボックスが
    cwd 基準で同じ範囲を担保するため引数として使わない）。

    ``max_turns`` は claude のみに効く（``codex exec`` に相当フラグは無い）。
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
            build_claude_allowed_tools(workspace),
            "--max-turns",
            str(max_turns),
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
        # --: prompt が - で始まる場合に clap パーサに CLI フラグと誤認されるのを防ぐ
        "--",
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
    if any(marker in haystack for marker in _LOGIN_MARKERS[backend]):
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
    except OSError:
        return None
    try:
        stdout, _ = await asyncio.wait_for(
            proc.communicate(), timeout=VERSION_TIMEOUT_SEC
        )
    except TimeoutError:
        # asyncio の wait_for はタイムアウトしても子プロセスを残す。この関数は
        # GET /api/agent/backends のたびに呼ばれるため、ハングするバイナリが
        # 1 つあると呼び出し回数だけプロセスがリークする。必ず後始末する。
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
        # kill だけでは stdout パイプ（transport）が残り、GC 時に閉じられる
        # 順序次第で "Event loop is closed" を送出する。communicate で回収する。
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(proc.communicate(), timeout=KILL_WAIT_SEC)
        return None
    line = stdout.decode("utf-8", errors="replace").strip().splitlines()
    return line[0] if line else None
