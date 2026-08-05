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
        """WHY: 最終行の {strategy_id, run_id, summary} JSON が GUI への結果反映の
        生命線。この契約が消えるとジョブは成功しても GUI に何も出ない。summary は
        完了パネルの説明文として表示されるため、同じ理由でここに含める。"""
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "strategy_id" in prompt
        assert "run_id" in prompt
        assert "summary" in prompt

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


class TestDerivePrompt:
    """派生開発モード（issue #491）: 既存戦略を起点に改善指示で再実行する。"""

    def test_derive_mode_embeds_base_id_and_instruction(self) -> None:
        prompt = build_agent_prompt(
            "トレード頻度を下げて", None, STRATS, base_strategy_id="base_s1"
        )
        assert "base_s1" in prompt
        assert "トレード頻度を下げて" in prompt

    def test_derive_mode_forbids_reusing_base_id(self) -> None:
        """WHY: 派生版が元戦略と同じ id で save すると元戦略が上書きされる。
        「新規 id を使え・元は変更するな」の指示はこの機能の安全制約の生命線。"""
        prompt = build_agent_prompt(
            "lower frequency", None, STRATS, base_strategy_id="base_s1"
        )
        assert "NEVER reuse" in prompt
        assert "must remain unchanged" in prompt

    def test_derive_mode_keeps_workspace_constraints(self) -> None:
        """派生モードでも workspace 限定・CLI 限定の安全制約は維持される。"""
        prompt = build_agent_prompt(
            "goal", None, STRATS, base_strategy_id="base_s1"
        )
        assert "Work only inside this workspace" in prompt
        assert "The only shell command" in prompt

    def test_derive_mode_pins_forge_config(self) -> None:
        prompt = build_agent_prompt(
            "goal",
            None,
            STRATS,
            forge_config_path=pathlib.Path("/ws/forge.yaml"),
            base_strategy_id="base_s1",
        )
        assert "FORGE_CONFIG=/ws/forge.yaml alpha-forge" in prompt

    def test_without_base_id_prompt_is_unchanged_mode(self) -> None:
        """base_strategy_id 無しでは従来の新規作成モード（回帰防止）。"""
        prompt = build_agent_prompt("goal", "CL=F", STRATS)
        assert "base_s1" not in prompt
        assert "NEVER reuse" not in prompt
