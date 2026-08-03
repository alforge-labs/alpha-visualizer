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

# codex が完了した item を載せて流すイベント種。codex は同じ item を
# ``item.started`` でも流すため、item の有無だけで判定すると同じメッセージが
# 二重にログへ出て、さらに部分テキストが最終結果として抽出されうる。
CODEX_COMPLETED_EVENT = "item.completed"


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


def _codex_completed_item(data: dict[str, Any]) -> dict[str, Any] | None:
    """完了イベントの item を返す（それ以外は None）。"""
    if data.get("type") != CODEX_COMPLETED_EVENT:
        return None
    item = data.get("item")
    return item if isinstance(item, dict) else None


def _format_codex(data: dict[str, Any]) -> str | None:
    item = _codex_completed_item(data)
    if item is None:
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
            item = _codex_completed_item(data)
            if (
                item is not None
                and item.get("type") == "agent_message"
                and isinstance(item.get("text"), str)
            ):
                final = item["text"]
    return final
