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

    def test_hook_events_are_suppressed(self) -> None:
        """WHY: Task 1 で実測確認。環境固有のフック ノイズを黙って読み飛ばす。"""
        assert (
            format_agent_event(
                "claude",
                '{"type": "system", "subtype": "hook_started", "hook_name": "SessionStart"}',
            )
            is None
        )

    def test_rate_limit_event_is_suppressed(self) -> None:
        """WHY: Task 1 で発見。未知のトップレベル type も無視する。"""
        assert (
            format_agent_event("claude", '{"type": "rate_limit_event", "info": {}}')
            is None
        )

    def test_assistant_with_thinking_only_is_suppressed(self) -> None:
        """WHY: Task 1 で実測確認。content が thinking block のみの行は人間向けログに載せない。"""
        assert (
            format_agent_event(
                "claude",
                json.dumps(
                    {
                        "type": "assistant",
                        "message": {
                            "content": [
                                {
                                    "type": "thinking",
                                    "thinking": "考え中...",
                                    "signature": "x",
                                }
                            ]
                        },
                    }
                ),
            )
            is None
        )


class TestExtractFinalTextClaude:
    def test_returns_result_field_of_last_result_event(self) -> None:
        stdout = "\n".join(['{"type": "system"}', CLAUDE_ASSISTANT, CLAUDE_RESULT])
        text = extract_final_text("claude", stdout)
        assert text is not None
        assert '"strategy_id"' in text

    def test_no_result_event_returns_none(self) -> None:
        assert extract_final_text("claude", CLAUDE_ASSISTANT) is None

    def test_returns_last_result_event_when_multiple(self) -> None:
        """WHY: リトライや複数ターンで result イベントが複数回出うる。最後の
        イベントが最終状態であり、最初を返す退行はステールな結果を GUI に流す。
        """
        first_result = json.dumps(
            {"type": "result", "subtype": "success", "result": "first"}
        )
        second_result = json.dumps(
            {"type": "result", "subtype": "success", "result": "second"}
        )
        stdout = "\n".join([first_result, CLAUDE_ASSISTANT, second_result])
        text = extract_final_text("claude", stdout)
        assert text == "second"


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

    def test_incomplete_item_event_is_suppressed(self) -> None:
        """WHY: codex は完了前にも item を載せたイベントを流す。item の有無だけで
        判定すると、同じメッセージがログに二重に出るうえ、部分テキストが最終
        結果として抽出され GUI に不完全な JSON が渡る。完了イベントに限定する。
        """
        partial = json.dumps(
            {
                "type": "item.started",
                "item": {"type": "agent_message", "text": '{"strategy_id": "cl_ne'},
            }
        )
        assert format_agent_event("codex", partial) is None
        assert extract_final_text("codex", partial) is None

    def test_completed_event_wins_over_preceding_partial(self) -> None:
        """WHY: 部分イベントを拾うと、後から来る完了イベントより前の不完全な
        テキストが混ざる。完了分のみを最終結果とする。"""
        partial = json.dumps(
            {"type": "item.started", "item": {"type": "agent_message", "text": "part"}}
        )
        stdout = "\n".join([partial, CODEX_MESSAGE])
        text = extract_final_text("codex", stdout)
        assert text is not None and '"strategy_id"' in text

    def test_returns_last_agent_message_when_multiple(self) -> None:
        """WHY: 複数ターンでいくつか agent_message が出うる。最後のメッセージ
        が最終状態であり、最初を返す退行はステールな結果を GUI に流す。
        """
        first_message = json.dumps(
            {
                "type": "item.completed",
                "item": {"type": "agent_message", "text": "first result"},
            }
        )
        second_message = json.dumps(
            {
                "type": "item.completed",
                "item": {"type": "agent_message", "text": "second result"},
            }
        )
        stdout = "\n".join([first_message, second_message])
        text = extract_final_text("codex", stdout)
        assert text == "second result"
