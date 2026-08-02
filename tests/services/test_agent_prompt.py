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
