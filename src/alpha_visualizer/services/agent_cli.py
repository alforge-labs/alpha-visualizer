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
