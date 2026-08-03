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
        """WHY: エージェントが workspace 外の操作を行わないよう制約を明記。
        この指示が消えるとエージェントが任意の shell コマンドを実行しうる。"""
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "Work only inside this workspace" in prompt
        assert "The only shell command" in prompt

    def test_forbids_modifying_existing_strategies(self) -> None:
        """WHY: エージェントが既存戦略を上書きしないよう指示。
        この制約が消えるとエージェントが既存戦略を破壊しうる（安全制約の生命線）。"""
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "Never overwrite or" in prompt
        assert "modify existing strategy files" in prompt
        assert "Do not modify or delete anything you did not create" in prompt

    def test_forge_config_path_pinning_when_specified(self) -> None:
        """WHY: ログインシェルの rc 再読込で FORGE_CONFIG が別ワークスペースへ上書きされることへの対策。
        この指示が消えるとエージェントが既存ユーザーのワークスペース設定で起動し、別ワークスペースを
        参照・破壊しうる。実測事例あり。"""
        config_path = pathlib.Path("/ws/forge.yaml")
        prompt = build_agent_prompt("goal", "CL=F", STRATS, forge_config_path=config_path)
        assert f"FORGE_CONFIG={config_path} alpha-forge" in prompt

    def test_forge_config_path_omitted_when_none(self) -> None:
        """FORGE_CONFIG 明示指示が無い場合は空文字で省略される（テンプレートに埋め込まれない）。"""
        prompt = build_agent_prompt("goal", "CL=F", STRATS, forge_config_path=None)
        assert "FORGE_CONFIG" not in prompt
