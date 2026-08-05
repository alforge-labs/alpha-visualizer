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
- Do not modify or delete anything you did not create.{config_pin}

When you are done, end your reply with a single line containing ONLY this JSON
(no code fence):
{{"strategy_id": "<id>", "run_id": "<run id of the final successful backtest>", "summary": "<one short sentence>"}}
"""


_DERIVE_PROMPT_TEMPLATE = """\
You are working inside an AlphaForge workspace (your current directory).

Your task: create ONE improved DERIVED version of the existing strategy
`{base_id}` that applies this instruction.

<instruction>
{goal}
</instruction>

Target symbol: {symbol_line}

Steps:
1. Read the existing strategy definition for `{base_id}` under
   `{strategies_dir}` and understand its structure.
2. Create ONE new strategy JSON file that applies the instruction. Give it a
   NEW unique id (for example `{base_id}_v2`). NEVER reuse `{base_id}` as the
   strategy id — the original strategy must remain unchanged. Never overwrite
   or modify existing strategy files.
3. Validate it by running:
   `alpha-forge backtest run --strategy-file <path> --json -- <SYMBOL>`
   Iterate on the strategy until the backtest completes successfully.
4. Register the finished strategy with the alpha-forge CLI
   (see `alpha-forge strategy save --help` for the exact usage).

Constraints:
- Work only inside this workspace. The only shell command you may use is the
  `alpha-forge` CLI.
- Do not modify or delete anything you did not create.{config_pin}

When you are done, end your reply with a single line containing ONLY this JSON
(no code fence):
{{"strategy_id": "<id>", "run_id": "<run id of the final successful backtest>", "summary": "<one short sentence>"}}
"""


def build_agent_prompt(
    goal: str,
    symbol: str | None,
    strategies_dir: pathlib.Path,
    forge_config_path: pathlib.Path | None = None,
    base_strategy_id: str | None = None,
) -> str:
    """ゴール・銘柄・戦略ディレクトリ（・forge_config 存在パス）からエージェント指示文を構築する。

    WHY (forge_config_path): codex エージェントはログインシェル（/bin/zsh -lc）で実行するため、
    ユーザーの ~/.zshrc で無条件に `export FORGE_CONFIG=<ユーザーの別ワークスペース>/forge.yaml` が
    再読込される場合がある。サーバーが正しく渡した FORGE_CONFIG が上書きされ、別ワークスペースを参照した
    実測事例への対策（https://github.com/alforge-labs/alpha-visualizer/issues/470）。
    forge_config_path が非 None のとき、各 alpha-forge コマンドに明示的に FORGE_CONFIG を
    プレフィックスするよう指示する。

    base_strategy_id が非 None のときは派生開発モード（issue #491）: 既存戦略を
    読み込み、指示を適用した**新規 id の派生版**を作らせる。元戦略の id を
    使い回すと save で上書きされるため、「NEVER reuse」の指示が安全制約の生命線。
    """
    config_pin = ""
    if forge_config_path is not None:
        config_pin = f"""
- Run EVERY alpha-forge command with the workspace config pinned explicitly,
  e.g. `FORGE_CONFIG={forge_config_path} alpha-forge ...`. Shell startup files
  may silently override FORGE_CONFIG to point at a DIFFERENT workspace; the
  explicit prefix prevents your commands from reading or writing outside this
  workspace."""

    if base_strategy_id is not None:
        return _DERIVE_PROMPT_TEMPLATE.format(
            goal=goal,
            base_id=base_strategy_id,
            symbol_line=(
                symbol
                if symbol
                else "use the base strategy's target symbol unless the instruction says otherwise"
            ),
            strategies_dir=strategies_dir,
            config_pin=config_pin,
        )

    symbol_line = symbol if symbol else "choose an appropriate symbol yourself"
    return _PROMPT_TEMPLATE.format(
        goal=goal,
        symbol_line=symbol_line,
        strategies_dir=strategies_dir,
        config_pin=config_pin,
    )
