# Live データ一括更新（live refresh）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** visualizer の Live ページから 1 クリックで sync-events → data update → live replay を実行できるようにする（forge に `live refresh` を新設し、visualizer はジョブ 1 本で委譲）。

**Architecture:** alpha-forge に config 駆動の `live refresh` コマンドを追加（replay パラメータを forge.yaml `live.replay` に永続化）。alpha-visualizer は既存 JobManager 基盤に JobKind `live_refresh` を 1 つ足し、`POST /api/live/jobs` → SSE 進捗 → 完了時 refetch のみを担う。詳細スペック: `docs/superpowers/specs/2026-08-06-live-refresh-gui-design.md`。

**Tech Stack:** Python（click / Pydantic / FastAPI）、TypeScript（React / Vite / vitest）、pytest、uv、pnpm

## Global Constraints

- コミットメッセージ・コード内コメントは日本語、Conventional Commits（`feat:` / `test:` / `docs:` 等）
- main 直接 push 禁止。各リポジトリで worktree を作って作業し、PR を作成（`gh pr create --body-file` 必須。インライン `--body` はバッククォートが化ける）
- EnterWorktree(fresh) は古い origin ref の可能性 → ブランチ作成前に `git fetch origin && git merge --ff-only origin/main` を実行
- alpha-forge: PR に CI が走らない → マージ前ローカルフルゲート必須（`uv run pytest` + `uv run ruff check .` + `uv run mypy` + codemap。codemap / lint の `--check` はパイプ厳禁・単独行で `$?` 確認）
- alpha-visualizer: `src/alpha_visualizer/` から `alpha_forge` を import しない。schemas 変更時は `cd frontend && pnpm run gen` 必須。frontend の型ゲートは `pnpm run build`（`tsc --noEmit` は no-op）
- Python は `uv` のみ使用。テスト実行は対象サブディレクトリで `uv run`
- forge の `--json` 契約: stdout は純 JSON、進捗・装飾は stderr（visualizer の SSE ログは stderr を常時表示する）
- 文字列 config の「未設定」は空文字 `""` で表す（`None` と `""` の 2 系統を作らない — `LiveConfig.benchmark` の docstring 参照）

---

# Part 1: alpha-forge（先行リリース）

作業場所: alpha-forge の worktree（ブランチ `feat/live-refresh`）。
`EnterWorktree` で作成し、Part 1 完了後 `ExitWorktree`。

### Task 1: `LiveReplayConfig` config モデル + default.yaml

**Files:**
- Modify: `src/alpha_forge/config.py`（`LiveConfig` の直前に `LiveReplayConfig` を追加、`LiveConfig` にフィールド追加）
- Modify: `src/alpha_forge/resources/config/default.yaml`（`live:` セクション拡張）
- Test: `tests/test_config.py`（末尾に追記）

**Interfaces:**
- Produces: `config.live.replay.portfolio_id: str`（既定 `""`）/ `config.live.replay.combine_strategies: list[str]`（既定 `[]`）/ `config.live.replay.initial_capital: float | None`（既定 `None`）/ `config.live.replay.compare: bool`（既定 `False`）。Task 2 / Task 3 がこれを読む。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_config.py` の末尾に追記:

```python
class TestLiveReplayConfig:
    """live.replay（live refresh / replay の既定パラメータ）の設定テスト。"""

    def test_既定値(self) -> None:
        config = AppConfig()
        assert config.live.replay.portfolio_id == ""
        assert config.live.replay.combine_strategies == []
        assert config.live.replay.initial_capital is None
        assert config.live.replay.compare is False

    def test_yamlから読み込める(self, tmp_path: Path) -> None:
        config_path = tmp_path / "forge.yaml"
        config_path.write_text(
            "live:\n"
            "  benchmark: QQQ\n"
            "  replay:\n"
            "    portfolio_id: pf_1\n"
            "    combine_strategies: [a_v1, b_v1]\n"
            "    initial_capital: 1000000\n"
            "    compare: true\n",
            encoding="utf-8",
        )
        from alpha_forge.config import load_config

        config = load_config(config_path)
        assert config.live.replay.portfolio_id == "pf_1"
        assert config.live.replay.combine_strategies == ["a_v1", "b_v1"]
        assert config.live.replay.initial_capital == 1_000_000
        assert config.live.replay.compare is True
        # 既存の live.benchmark と共存する
        assert config.live.benchmark == "QQQ"

    def test_default_yamlテンプレートにreplayセクションがある(self) -> None:
        """`alpha-forge system init` が展開するテンプレートと config モデルの同期を保証する。"""
        from alpha_forge.config import load_config

        config = load_config(default_config_path)
        assert config.live.replay.portfolio_id == ""
        assert config.live.replay.combine_strategies == []
```

注: `AppConfig` / `Path` / `default_config_path` は既存テストが使っている import / fixture をそのまま使う（`tests/test_config.py` 冒頭を確認して合わせる。`default_config_path` が fixture でなくパス定数の場合も既存の書き方に従う）。

- [ ] **Step 2: テストが落ちることを確認**

```bash
cd <worktree>/  # alpha-forge worktree
uv run pytest tests/test_config.py -k LiveReplay -v
```

Expected: FAIL（`AttributeError: 'LiveConfig' object has no attribute 'replay'`）

- [ ] **Step 3: 実装**

`src/alpha_forge/config.py` — `LiveConfig`（295 行付近）の直前に追加:

```python
class LiveReplayConfig(BaseModel):
    """`live replay` / `live refresh` の既定パラメータ。

    visualizer の Live 更新ボタン（`live refresh`）はこの設定だけを見る。
    `--initial-capital` の手打ち忘れでリターン率が基準資本比でずれる事故
    (#1332) を、設定ファイルへの永続化で構造的に防ぐ。
    """

    portfolio_id: str = ""
    """replay 対象の combine portfolio ID。未設定は空文字（benchmark と同じ 1 系統ルール）"""
    combine_strategies: list[str] = Field(default_factory=list)
    """combine 対象戦略 ID。2 戦略以上で有効"""
    initial_capital: float | None = None
    """ライブ口座の基準資本。None なら backtest.initial_capital を使う"""
    compare: bool = False
    """True なら backtest combine との比較を常に付ける（--compare 相当）"""
```

`LiveConfig` に追加（`benchmark` フィールドの後）:

```python
    replay: LiveReplayConfig = Field(default_factory=LiveReplayConfig)
```

`src/alpha_forge/resources/config/default.yaml` の `live:` セクション（98 行付近）を拡張:

```yaml
# ライブ実績（live replay / live refresh）の既定設定
live:
  # live replay の既定ベンチマーク銘柄。--benchmark で都度上書きできる。
  # 未設定ならベンチマーク比較線は表示しない。
  benchmark: ""
  # live refresh / replay 引数省略時の既定パラメータ
  replay:
    portfolio_id: ""         # combine portfolio ID（例: my_hedged_pf_v1）
    combine_strategies: []   # combine 対象戦略 ID（2 つ以上）
    initial_capital: null    # ライブ口座の基準資本（null なら backtest.initial_capital）
    compare: false           # backtest combine と比較する
```

- [ ] **Step 4: テストが通ることを確認**

```bash
uv run pytest tests/test_config.py -v
```

Expected: 全 PASS（既存テスト含む）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/config.py src/alpha_forge/resources/config/default.yaml tests/test_config.py
git commit -m "feat(config): live.replay 既定パラメータ設定を追加"
```

---

### Task 2: `live replay` の config フォールバック

**Files:**
- Modify: `src/alpha_forge/commands/live.py`（`live_replay` の引数定義と解決ロジック）
- Test: `tests/test_cli_live_refresh_config.py`（新規）

**Interfaces:**
- Consumes: Task 1 の `config.live.replay.*`
- Produces: `_resolve_replay_params(config, portfolio_id, combine_strategies_csv, do_compare, initial_capital) -> tuple[str, list[str], bool, float]`（module-level 関数。返り値は `(portfolio_id, strategy_ids, do_compare, initial_capital)`。未解決時は `click.UsageError` を送出）。Task 3 の `live refresh` がこれを再利用する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_cli_live_refresh_config.py`（新規）:

```python
"""`live replay` の config フォールバック（live.replay 既定値）のテスト。

「config が既定値・フラグが上書き」の解決順を保証する。既存の明示指定
（引数 + --combine-strategies）の後方互換は test_cli_live_replay_1332.py が
引き続き担う。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from alpha_forge.cli import cli

from _live_cli_fixtures import patch_live_cli


def _app_config_with_replay(tmp_path: Path, **replay_overrides: Any) -> Any:
    from alpha_forge.config import (
        AppConfig,
        JournalConfig,
        LiveReplayConfig,
        LiveConfig,
    )

    return AppConfig(
        journal=JournalConfig(journal_path=tmp_path / "journal", auto_record=True),
        live=LiveConfig(replay=LiveReplayConfig(**replay_overrides)),
    )


class TestReplayConfigFallback:
    def test_引数省略時はconfigのreplay設定を使う(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        app_config = _app_config_with_replay(
            tmp_path,
            portfolio_id="pf_cfg",
            combine_strategies=["a_v1", "b_v1"],
            initial_capital=1_000_000.0,
        )
        captured = patch_live_cli(tmp_path, monkeypatch, app_config=app_config)
        result = CliRunner().invoke(cli, ["live", "replay", "--json"])
        assert result.exit_code == 0, result.output
        assert captured["portfolio_id"] == "pf_cfg"
        assert captured["initial_capital"] == 1_000_000.0
        # strategies（load_strategy の結果リスト）の捕捉形式は
        # tests/_live_cli_fixtures.py の実装を確認して assertion を追加する

    def test_引数はconfigより優先される(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        app_config = _app_config_with_replay(
            tmp_path,
            portfolio_id="pf_cfg",
            combine_strategies=["a_v1", "b_v1"],
            initial_capital=1_000_000.0,
        )
        captured = patch_live_cli(tmp_path, monkeypatch, app_config=app_config)
        result = CliRunner().invoke(
            cli,
            [
                "live", "replay", "pf_arg",
                "--combine-strategies", "c_v1,d_v1",
                "--initial-capital", "500000",
                "--json",
            ],
        )
        assert result.exit_code == 0, result.output
        assert captured["portfolio_id"] == "pf_arg"
        assert captured["initial_capital"] == 500_000.0

    def test_configも引数も無ければUsageError(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        app_config = _app_config_with_replay(tmp_path)  # replay 未設定
        patch_live_cli(tmp_path, monkeypatch, app_config=app_config)
        result = CliRunner().invoke(cli, ["live", "replay", "--json"])
        assert result.exit_code == 2
        assert "live.replay" in result.output

    def test_config指定でもcombineが1戦略ならUsageError(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        app_config = _app_config_with_replay(
            tmp_path, portfolio_id="pf_cfg", combine_strategies=["only_v1"]
        )
        patch_live_cli(tmp_path, monkeypatch, app_config=app_config)
        result = CliRunner().invoke(cli, ["live", "replay", "--json"])
        assert result.exit_code == 2
        assert "2 戦略以上" in result.output
```

注: `patch_live_cli` が返す captured dict のキーは `tests/_live_cli_fixtures.py` の実装（`build_combine_live_summary` の kwargs 捕捉）を確認し、`strategies` の検証方法を実際の捕捉形式に合わせて修正すること。

- [ ] **Step 2: テストが落ちることを確認**

```bash
uv run pytest tests/test_cli_live_refresh_config.py -v
```

Expected: FAIL（引数省略ケースが `Missing argument 'PORTFOLIO_ID'` で exit 2 になり、config 値が使われない）

- [ ] **Step 3: 実装**

`src/alpha_forge/commands/live.py`:

1. `live_replay` のデコレータを変更:
   - `@click.argument("portfolio_id")` → `@click.argument("portfolio_id", required=False, default=None)`
   - `--combine-strategies` の `required=True` を外し `default=None` に。help に「省略時は forge.yaml の live.replay.combine_strategies」を追記
   - `--initial-capital` の help に「既定: live.replay.initial_capital → backtest.initial_capital」を追記
2. module-level に解決関数を追加（`live_replay` の直前）:

```python
def _resolve_replay_params(
    config: "AppConfig",
    portfolio_id: str | None,
    combine_strategies_csv: str | None,
    do_compare: bool,
    initial_capital: float | None,
) -> tuple[str, list[str], bool, float]:
    """replay パラメータを「フラグ > config.live.replay > backtest 既定」の順で解決する。

    `live replay` と `live refresh` の両方が使う。未解決は UsageError で
    設定手順を明示する（visualizer からの実行時もこの文言がそのまま届く）。
    """
    replay_cfg = config.live.replay
    resolved_portfolio = portfolio_id or replay_cfg.portfolio_id
    if not resolved_portfolio:
        raise click.UsageError(
            "portfolio_id を指定するか、forge.yaml の live.replay.portfolio_id を設定してください"
        )
    if combine_strategies_csv is not None:
        strategy_ids = [s.strip() for s in combine_strategies_csv.split(",") if s.strip()]
    else:
        strategy_ids = [s for s in replay_cfg.combine_strategies if s.strip()]
    if len(strategy_ids) < 2:
        raise click.UsageError(
            "combine 対象は 2 戦略以上必要です。--combine-strategies か"
            " forge.yaml の live.replay.combine_strategies を設定してください"
        )
    resolved_capital = (
        initial_capital
        if initial_capital is not None
        else (
            replay_cfg.initial_capital
            if replay_cfg.initial_capital is not None
            else float(config.backtest.initial_capital)
        )
    )
    # --compare は「付けたら ON」のフラグ。config が True なら常時 ON になる
    return resolved_portfolio, strategy_ids, (do_compare or replay_cfg.compare), resolved_capital
```

3. `live_replay` 本体の既存解決コード（`strategy_ids = ...` の 2 行と `initial_capital` の三項式）を `_resolve_replay_params` 呼び出しに置き換える:

```python
    portfolio_id, strategy_ids, do_compare, initial_capital = _resolve_replay_params(
        config, portfolio_id, combine_strategies_csv, do_compare, initial_capital
    )
    strategies = [load_strategy(sid) for sid in strategy_ids]
```

（`build_combine_live_summary` 呼び出しの `initial_capital=(...)` 三項式は `initial_capital=initial_capital` に単純化する）

- [ ] **Step 4: テストが通ることを確認（既存の replay テスト含む）**

```bash
uv run pytest tests/test_cli_live_refresh_config.py tests/test_cli_live_replay_1332.py tests/test_cli_live_benchmark.py tests/test_cli_live.py -v
```

Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/commands/live.py tests/test_cli_live_refresh_config.py
git commit -m "feat(live): live replay の引数を live.replay 設定へフォールバック可能にする"
```

---

### Task 3: ヘルパー抽出 + `live refresh` コマンド新設

**Files:**
- Modify: `src/alpha_forge/commands/live.py`（sync-events / replay のヘルパー抽出 + `live refresh` 追加）
- Modify: `src/alpha_forge/commands/data.py`（`data_update` のループ本体を `run_data_update` に抽出）
- Test: `tests/test_cli_live_refresh.py`（新規）

**Interfaces:**
- Consumes: Task 2 の `_resolve_replay_params`
- Produces:
  - `commands/data.py`: `run_data_update(emit: Callable[[str], None], *, show_freemium_panel: bool) -> dict[str, Any]`（返り値は既存 `--json` と同形: `{"results": [...], "updated_count": int, "total": int}`）
  - `commands/live.py`: `SyncEventsError(Exception)`（`returncode: int` 属性を持つ）/ `_remote_config_error(remote) -> str | None` / `_run_sync_events(remote, dry_run: bool) -> None`（失敗時 `SyncEventsError`）/ `_execute_replay(config, store, portfolio_id, strategy_ids, since, do_compare, initial_capital, benchmark_symbol) -> dict[str, Any]`（サマリ構築 + `save_position_summary` まで実施し `build_combine_live_summary` の結果 dict を返す）
  - CLI: `alpha-forge live refresh [--json]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_cli_live_refresh.py`（新規）:

```python
"""`live refresh`（sync-events → data update → replay 一括実行）のテスト。

- config 未設定はステップ実行前に fail-fast（exit 2）
- remote.enabled=false は sync をスキップして続行
- ステップ失敗は即中断（後続ステップを実行しない）・exit 1・ステップ名を stderr に明示
- --json は stdout 純 JSON（steps + replay 要約）
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest import mock

import pytest
from click.testing import CliRunner

from alpha_forge.cli import cli

from _live_cli_fixtures import patch_live_cli


def _refresh_config(tmp_path: Path, *, remote_enabled: bool = False) -> Any:
    from alpha_forge.config import (
        AppConfig,
        JournalConfig,
        LiveConfig,
        LiveReplayConfig,
        RemoteConfig,
    )

    return AppConfig(
        journal=JournalConfig(journal_path=tmp_path / "journal", auto_record=True),
        live=LiveConfig(
            replay=LiveReplayConfig(
                portfolio_id="pf_1",
                combine_strategies=["a_v1", "b_v1"],
                initial_capital=1_000_000.0,
            )
        ),
        remote=RemoteConfig(
            enabled=remote_enabled,
            host="203.0.113.1" if remote_enabled else "",
            user="ubuntu" if remote_enabled else "",
            events_path="/opt/events" if remote_enabled else "",
        ),
    )


DATA_UPDATE_OK = {"results": [], "updated_count": 3, "total": 3}


def _invoke_refresh(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    app_config: Any,
    *,
    sync_side_effect: Exception | None = None,
    data_side_effect: Exception | None = None,
) -> tuple[Any, mock.MagicMock, mock.MagicMock]:
    patch_live_cli(tmp_path, monkeypatch, app_config=app_config)
    sync_mock = mock.MagicMock(side_effect=sync_side_effect)
    data_mock = mock.MagicMock(
        return_value=DATA_UPDATE_OK, side_effect=data_side_effect
    )
    monkeypatch.setattr("alpha_forge.commands.live._run_sync_events", sync_mock)
    monkeypatch.setattr("alpha_forge.commands.live.run_data_update", data_mock)
    runner = CliRunner(mix_stderr=False)
    result = runner.invoke(cli, ["live", "refresh", "--json"])
    return result, sync_mock, data_mock


class TestLiveRefresh:
    def test_config未設定はステップ実行前にfail_fast(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from alpha_forge.config import AppConfig, JournalConfig

        app_config = AppConfig(
            journal=JournalConfig(journal_path=tmp_path / "journal", auto_record=True)
        )
        result, sync_mock, data_mock = _invoke_refresh(tmp_path, monkeypatch, app_config)
        assert result.exit_code == 2
        assert "live.replay" in result.stderr
        sync_mock.assert_not_called()
        data_mock.assert_not_called()

    def test_remote無効はsyncスキップで完走する(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        result, sync_mock, data_mock = _invoke_refresh(
            tmp_path, monkeypatch, _refresh_config(tmp_path, remote_enabled=False)
        )
        assert result.exit_code == 0, result.stderr
        sync_mock.assert_not_called()
        data_mock.assert_called_once()
        payload = json.loads(result.output)  # stdout 純 JSON 契約
        assert [s["status"] for s in payload["steps"]] == ["skipped", "done", "done"]
        assert payload["replay"]["portfolio_id"] == "pf_1"
        assert "live_metrics" in payload["replay"]

    def test_remote有効はsyncを実行する(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        result, sync_mock, _ = _invoke_refresh(
            tmp_path, monkeypatch, _refresh_config(tmp_path, remote_enabled=True)
        )
        assert result.exit_code == 0, result.stderr
        sync_mock.assert_called_once()
        payload = json.loads(result.output)
        assert payload["steps"][0] == {"name": "sync_events", "status": "done"}

    def test_sync失敗は後続を実行せずexit1(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from alpha_forge.commands.live import SyncEventsError

        result, _, data_mock = _invoke_refresh(
            tmp_path,
            monkeypatch,
            _refresh_config(tmp_path, remote_enabled=True),
            sync_side_effect=SyncEventsError("rsync failed", returncode=23),
        )
        assert result.exit_code == 1
        assert "sync_events" in result.stderr
        data_mock.assert_not_called()

    def test_data_update失敗はreplayを実行せずexit1(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        result, _, _ = _invoke_refresh(
            tmp_path,
            monkeypatch,
            _refresh_config(tmp_path),
            data_side_effect=RuntimeError("storage broken"),
        )
        assert result.exit_code == 1
        assert "data_update" in result.stderr
        # replay 未実行 = stdout に JSON が出ない
        assert result.output.strip() == ""
```

注: `_invoke_refresh` 内で `patch_live_cli` の捕捉 dict を返すよう必要に応じて調整する。`CliRunner(mix_stderr=False)` が使えない click バージョンの場合は `result.output` / `result.stderr` の使い分けを既存テストの流儀に合わせる。

- [ ] **Step 2: テストが落ちることを確認**

```bash
uv run pytest tests/test_cli_live_refresh.py -v
```

Expected: FAIL(collection error)（`SyncEventsError` / `run_data_update` / `live refresh` コマンドが存在しない）

- [ ] **Step 3: `data.py` から `run_data_update` を抽出**

`src/alpha_forge/commands/data.py` — `data_update`（515 行付近）の本体（`store = DataStore(...)` から結果 dict 組み立てまで）を module-level 関数へ移動:

```python
def run_data_update(
    emit: Callable[[str], None], *, show_freemium_panel: bool
) -> dict[str, Any]:
    """保存済み全データセットの差分更新を実行する（data update / live refresh 共用）。

    emit は進捗 1 行を受け取るコールバック（CLI は stdout、live refresh --json は
    stderr へ流す）。返り値は `data update --json` と同形:
    ``{"results": [...], "updated_count": int, "total": int}``。
    """
```

移動時の変換規則:
- 既存本体の `emit(...)`（`output_json` で分岐するローカル関数）呼び出しはそのまま新しい `emit` 引数の呼び出しになる
- `print_freemium_panel(...)` は `if freemium_notice is not None and show_freemium_panel:` に変更
- `echo_json(...)` / `click.echo(...)`（最終出力）は関数に含めず、結果 dict を `return` する
- 個別銘柄の取得失敗は現行どおり `results` に `status: "error"` 等で蓄積して続行する（関数全体は raise しない）

`data_update` コマンド本体は wrapper になる:

```python
@data.command("update", ...)  # デコレータは変更しない
@json_option()
def data_update(output_json: bool) -> None:
    def emit(message: str, *, err: bool = False) -> None:
        if not output_json:
            click.echo(message, err=err)

    summary = run_data_update(
        lambda msg: emit(msg), show_freemium_panel=not output_json
    )
    if output_json:
        echo_json(summary)
```

（既存の「データ無し」早期 return も `run_data_update` 内に移し、`{"results": [], "updated_count": 0, "total": 0}` を返す形に統一。人間向けの「保存済みのデータがありません。」は emit 経由で出す）

- [ ] **Step 4: `live.py` のヘルパー抽出**

`src/alpha_forge/commands/live.py`:

1. 例外クラスを module-level に追加:

```python
class SyncEventsError(Exception):
    """sync-events の rsync 失敗（returncode 付き）。"""

    def __init__(self, message: str, *, returncode: int) -> None:
        self.returncode = returncode
        super().__init__(message)
```

2. `live_sync_events` から検証と rsync 実行を抽出:

```python
def _remote_config_error(remote: "RemoteConfig") -> str | None:
    """sync-events に必要な remote 設定の不足メッセージを返す（充足時 None）。"""
    if not remote.host or not remote.user or not remote.events_path:
        return str(
            L(
                ja="remote.host, remote.user, remote.events_path を設定してください。",
                en="Set remote.host, remote.user, and remote.events_path.",
            )
        )
    return None


def _run_sync_events(remote: "RemoteConfig", dry_run: bool) -> None:
    """rsync でイベントログを同期する。失敗・タイムアウトは SyncEventsError。"""
```

`_run_sync_events` の本体は既存 `live_sync_events` の rsync 部分（`local_path` 算出〜`subprocess.run`）を移動し、`TimeoutExpired` → `SyncEventsError(タイムアウト文言, returncode=1)`、`proc.returncode != 0` → `SyncEventsError(f"rsync が失敗しました (exit {proc.returncode})", returncode=proc.returncode)` に変換する。`live_sync_events` コマンドは検証（`enabled` チェック + `_remote_config_error`）→ `_run_sync_events` 呼び出し → `SyncEventsError` を catch して現行同様のメッセージ + `SystemExit(exc.returncode)` の wrapper にする。

3. `live_replay` から実行本体を抽出:

```python
def _execute_replay(
    config: "AppConfig",
    store: "LiveStore",
    portfolio_id: str,
    strategy_ids: list[str],
    since: "datetime | None",
    do_compare: bool,
    initial_capital: float,
    benchmark_symbol: str,
) -> dict[str, Any]:
    """replay 本体: strategies ロード → サマリ構築 → 永続化。replay / refresh 共用。"""
```

本体 = 既存 `live_replay` の `strategies = [load_strategy(...)]` から `store.save_position_summary(...)` まで（`combined_engine` 構築含む）。`live_replay` は `_resolve_replay_params` → `_execute_replay` → 出力整形（`--json` / テーブル）だけを持つ形になる。

- [ ] **Step 5: `live refresh` コマンドを追加**

`src/alpha_forge/commands/live.py` の末尾（`live_replay` の後）:

```python
@live.command(
    "refresh",
    help=L(
        ja="sync-events → data update → replay を一括実行する（visualizer の Live 更新もこれを使う）",
        en="Run sync-events → data update → replay in one shot (used by the visualizer's Live refresh)",
    ),
    epilog=json_output_epilog(),
)
@_json_option()
def live_refresh(output_json: bool) -> None:
    """Live ページ反映までの 3 ステップを config（live.replay / remote）駆動で実行する。

    進捗は常に stderr へ 1 行ずつ出す（--json の stdout 純 JSON 契約を保ちつつ、
    visualizer のジョブ SSE ログにステップ進捗が流れる）。ステップ失敗は即中断し、
    どのステップで失敗したかを stderr とプロセス終了コードで明示する（Fail Loud）。
    """
    from alpha_forge.commands.data import run_data_update

    config = get_config()
    # ステップ実行前の fail-fast（設定不備で途中まで走らせない）
    portfolio_id, strategy_ids, do_compare, initial_capital = _resolve_replay_params(
        config, None, None, False, None
    )

    def progress(message: str) -> None:
        click.echo(message, err=True)

    steps: list[dict[str, Any]] = []

    # --- step 1/3: sync-events -------------------------------------------
    if not config.remote.enabled:
        progress(str(L(ja="[1/3] sync-events: スキップ（remote.enabled=false）",
                       en="[1/3] sync-events: skipped (remote.enabled=false)")))
        steps.append({"name": "sync_events", "status": "skipped", "reason": "remote_disabled"})
    else:
        error = _remote_config_error(config.remote)
        if error is not None:
            _fail_step(steps, "sync_events", error)
        progress(str(L(ja="[1/3] sync-events: 同期中...", en="[1/3] sync-events: syncing...")))
        try:
            _run_sync_events(config.remote, dry_run=False)
        except SyncEventsError as exc:
            _fail_step(steps, "sync_events", str(exc))
        steps.append({"name": "sync_events", "status": "done"})

    # --- step 2/3: data update -------------------------------------------
    progress(str(L(ja="[2/3] data update: 市場データ更新中...", en="[2/3] data update: updating market data...")))
    try:
        update_summary = run_data_update(progress, show_freemium_panel=not output_json)
    except Exception as exc:  # noqa: BLE001 — ステップ境界で失敗を集約する
        _fail_step(steps, "data_update", str(exc))
    steps.append({"name": "data_update", "status": "done",
                  "updated_count": update_summary["updated_count"]})

    # --- step 3/3: replay -------------------------------------------------
    progress(str(L(ja="[3/3] replay: ライブサマリ再構築中...", en="[3/3] replay: rebuilding live summary...")))
    try:
        result = _execute_replay(
            config, _get_store(), portfolio_id, strategy_ids,
            since=None, do_compare=do_compare,
            initial_capital=initial_capital,
            benchmark_symbol=config.live.benchmark,
        )
    except Exception as exc:  # noqa: BLE001 — ステップ境界で失敗を集約する
        _fail_step(steps, "replay", str(exc))
    steps.append({"name": "replay", "status": "done"})

    if output_json:
        _echo_json({
            "steps": steps,
            "replay": {
                "portfolio_id": portfolio_id,
                "receipts_count": result["receipts_count"],
                "live_metrics": result["live_metrics"],
                "backtest_metrics": result["backtest_metrics"],
                "sub_strategies": result["sub_strategies"],
            },
        })
        return
    progress(str(L(ja=f"完了: receipts={result['receipts_count']}", en=f"Done: receipts={result['receipts_count']}")))
```

補助関数（`live_refresh` の直前に追加）:

```python
def _fail_step(steps: list[dict[str, Any]], step: str, message: str) -> "NoReturn":
    """ステップ失敗を stderr に明示して即中断する（後続ステップは実行しない）。"""
    steps.append({"name": step, "status": "failed", "error": message})
    click.echo(
        str(L(ja=f"エラー: ステップ {step} が失敗しました: {message}",
              en=f"Error: step {step} failed: {message}")),
        err=True,
    )
    raise SystemExit(1)
```

（`NoReturn` は `typing` から import。import 位置・スタイルはファイル冒頭の既存 import 群に合わせる）

- [ ] **Step 6: テストが通ることを確認（data / live の既存テスト含む）**

```bash
uv run pytest tests/test_cli_live_refresh.py tests/test_cli_live_refresh_config.py -v
uv run pytest tests/test_cli_data.py tests/test_cli_live.py tests/test_cli_live_replay_1332.py tests/test_cli_live_benchmark.py -v
```

Expected: 全 PASS（`data update` の抽出リファクタが既存テストを壊していないこと）

- [ ] **Step 7: コミット**

```bash
git add src/alpha_forge/commands/live.py src/alpha_forge/commands/data.py tests/test_cli_live_refresh.py
git commit -m "feat(live): live refresh コマンドを新設（sync-events → data update → replay 一括実行）"
```

---

### Task 4: alpha-forge フルゲート + PR

**Files:**
- なし（検証とコミット・PR のみ）

- [ ] **Step 1: フルゲートを実行（CI が無いためローカル必須）**

```bash
uv run pytest
uv run ruff check .
uv run mypy src/
```

それぞれ**単独行で実行**し exit code を確認する（パイプ厳禁）。codemap の生成コマンドはリポジトリの慣行（`Makefile` / 既存 PR）を確認して同様に単独実行する。失敗があれば修正してからコミット。

- [ ] **Step 2: EULA §11.8（外部通信）の確認**

`live refresh` は既存機能（rsync / データ取得）の組み合わせで**新規の外部通信は増えていない**ことを確認する（EULA 本文変更は不要。変更が必要になった場合のみ `CURRENT_EULA_VERSION` のバンプとセットで行う）。

- [ ] **Step 3: PR 作成**

```bash
git push -u origin feat/live-refresh
# PR 本文はファイルに書いてから（インライン --body はバッククォートが化ける）
gh pr create --title "feat(live): live refresh コマンド新設と live.replay 設定" --body-file /tmp/pr_body.md
```

PR 本文には: 概要（visualizer Live 更新の forge 側受け皿）/ 変更点 3 点（config・replay フォールバック・refresh）/ テスト結果 / 「labs docs はリンク PR」を記載。

- [ ] **Step 4: ExitWorktree（マージ後）**

マージは人間の承認後。マージ確認後にワークツリーを終了し、ブランチを削除（worktree remove → branch -d の順）。

---

### Task 5: alforge-labs ドキュメント（リンク PR）

**Files:**
- Modify: `alforge-labs/mkdocs_src/ja/`・`alforge-labs/mkdocs_src/en/` 配下の alpha-forge CLI / 設定リファレンスページ（`grep -rln "sync-events" mkdocs_src/` で対象ページを特定する）
- 生成: `mkdocs build` の成果物（`ja/docs/` 等）

- [ ] **Step 1: 対象ページを特定して追記**

alforge-labs リポジトリの worktree（ブランチ `docs/live-refresh`）で、`live` コマンド群を説明するページ（ja / en 両方）に以下を追記:

1. `live refresh` の説明（3 ステップ・`remote.enabled=false` はスキップ・visualizer の Live 更新ボタンが使う）
2. `forge.yaml` の `live.replay` セクション（4 キーの説明。`initial_capital` 未設定時のリターン率ズレ注意を含める）
3. `live replay` の引数省略（config フォールバック）の説明

- [ ] **Step 2: ビルドして成果物をコミット**

```bash
cd <labs-worktree>
uv run mkdocs build -f mkdocs.ja.yml
uv run mkdocs build -f mkdocs.en.yml   # en 設定ファイルが存在する場合
git add -A
git commit -m "docs: live refresh コマンドと live.replay 設定を追記"
git push -u origin docs/live-refresh
gh pr create --title "docs: live refresh コマンドと live.replay 設定を追記" --body-file /tmp/labs_pr_body.md
```

PR 本文に forge 側 PR の URL をリンクする。

---

**Part 1 完了条件**: forge PR + labs docs PR がマージされ、forge がリリースされていること（リリース実施はユーザー判断。visualizer 側の作業自体はスタブでテストするため、リリース前でも Part 2 の実装は進められる）。

---

# Part 2: alpha-visualizer

作業場所: alpha-visualizer の worktree（ブランチ `feat/live-refresh-gui`）。
`EnterWorktree` 後、`uv sync` と `cd frontend && pnpm install` を先に実行する。

### Task 6: JobKind `live_refresh` + スキーマ + OpenAPI 型再生成

**Files:**
- Modify: `src/alpha_visualizer/services/jobs.py`（JobKind 追加・argv ビルダー・dispatch 分岐）
- Modify: `src/alpha_visualizer/schemas/live.py`（`CreateLiveJobRequest` 追加）
- Test: `tests/services/test_jobs_argv.py`（既存の argv テストファイルがあれば追記、無ければ新規）
- 生成: `frontend/openapi.json`・`frontend/src/api/types.gen.ts`（Task 7 の router 追加後にまとめて再生成するため、本タスクでは生成しない）

**Interfaces:**
- Produces:
  - `JobKind` に `"live_refresh"` を追加
  - `build_live_refresh_argv(forge_exe: str) -> list[str]` → `[forge_exe, "live", "refresh", "--json"]`
  - `CreateLiveJobRequest`（`action: Literal["refresh"]`）。Task 7 の router が使う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/` の既存 argv テスト（`grep -rln "build_data_argv" tests/services/` で特定。無ければ `tests/services/test_jobs_argv.py` を新規作成し、既存 argv テストの import スタイルに合わせる）に追記:

```python
def test_live_refresh_argv() -> None:
    """live refresh は引数無し・--json のみ（パラメータは forge.yaml が持つ）。"""
    from alpha_visualizer.services.jobs import build_live_refresh_argv

    assert build_live_refresh_argv("/usr/local/bin/alpha-forge") == [
        "/usr/local/bin/alpha-forge", "live", "refresh", "--json",
    ]
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
cd <worktree>/  # alpha-visualizer worktree
uv run pytest tests/services/ -k live_refresh -v
```

Expected: FAIL（ImportError: `build_live_refresh_argv` が存在しない）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/services/jobs.py`:

1. `JobKind` を変更（72 行付近）:

```python
JobKind = Literal["backtest", "optimize", "wft", "agent", "data_fetch", "data_update", "live_refresh"]
```

2. `build_data_argv` の後に追加:

```python
def build_live_refresh_argv(forge_exe: str) -> list[str]:
    """live refresh ジョブの argv。

    パラメータ（portfolio / combine 戦略 / 基準資本）は forge.yaml の
    `live.replay` が持つため引数は無い。forge が 3 ステップの進捗を
    stderr へ流し、そのまま SSE ログに表示される。
    """
    return [forge_exe, "live", "refresh", "--json"]
```

3. `_execute` の分岐（638 行付近の data 分岐の後）に追加:

```python
            elif record.kind == "live_refresh":
                argv = build_live_refresh_argv(forge_exe)
```

`src/alpha_visualizer/schemas/live.py` の末尾に追加:

```python
class CreateLiveJobRequest(BaseModel):
    """`POST /api/live/jobs` のリクエスト。

    現状 action は refresh のみ（forge `live refresh` への委譲）。パラメータは
    forge.yaml の `live.replay` が SSoT のため、リクエストには載せない。
    """

    model_config = ConfigDict(extra="ignore")

    action: Literal["refresh"]
```

（`ConfigDict` / `Literal` の import をファイル冒頭に追加。既存 schemas ファイルの import スタイルに合わせる）

- [ ] **Step 4: テストが通ることを確認**

```bash
uv run pytest tests/services/ -v
```

Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/services/jobs.py src/alpha_visualizer/schemas/live.py tests/services/
git commit -m "feat(jobs): JobKind live_refresh と argv ビルダーを追加"
```

---

### Task 7: `POST /api/live/jobs` エンドポイント

**Files:**
- Modify: `src/alpha_visualizer/routers/live.py`（エンドポイント追加）
- Test: `tests/routers/test_live_jobs.py`（新規）
- 生成: `frontend/openapi.json`・`frontend/src/api/types.gen.ts`

**Interfaces:**
- Consumes: Task 6 の `CreateLiveJobRequest` / JobKind `"live_refresh"`
- Produces: `POST /api/live/jobs` → 202 + `JobSummary`（`routers/jobs.py` の `_to_summary` を再利用）。フロント（Task 8）は生成型 `CreateLiveJobRequest` を使う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/routers/test_live_jobs.py`（新規。fixture は `tests/routers/test_data.py` の `data_jobs_client` / `_make_stub` / `_wait_status` を踏襲):

```python
"""`POST /api/live/jobs`（live refresh ジョブ起動）のテスト。

data ジョブ（test_data.py）と同じガード方針:
- 非 loopback 公開中は 403（書き込み系）
- forge 未導入は 503 で fail-fast（ジョブを積んでから失敗させない）
- スタブ forge の argv echo で CLI 契約（live refresh --json）を検証する
"""

from __future__ import annotations

import pathlib
import stat
import time
from collections.abc import Iterator
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.jobs import JobManager


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    stub = tmp_path / "alpha-forge"
    stub.write_text(f"#!/bin/sh\n{body}\n")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


@pytest.fixture()
def live_jobs_client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    """スタブ forge を注入した live ジョブ用クライアント。

    ルーターの fail-fast が呼ぶ `routers.live.resolve_forge_exe` は実 PATH を
    見るため patch 必須（CLI の無い CI で 503 になる罠。test_data.py と同じ）。
    """
    stub = _make_stub(
        tmp_path,
        'echo "ARGS: $@" >&2\nprintf \'{"steps": [], "replay": {"portfolio_id": "pf_1"}}\'',
    )
    app = create_app(forge_dir=tmp_path)
    app.state.job_manager = JobManager(
        forge_config=ForgeConfig.from_forge_dir(tmp_path),
        forge_resolver=lambda: stub,
        concurrency=1,
        timeout_sec=30,
    )
    with (
        mock.patch(
            "alpha_visualizer.routers.live.resolve_forge_exe", return_value=stub
        ),
        TestClient(app) as client,
    ):
        yield client


def _wait_status(
    client: TestClient, job_id: str, statuses: set[str], timeout: float = 10.0
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    body: dict[str, Any] = {}
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body.get("status") in statuses:
            return body
        time.sleep(0.05)
    return body


class TestCreateLiveJob:
    def test_refreshジョブを起動して完了する(self, live_jobs_client: TestClient) -> None:
        resp = live_jobs_client.post("/api/live/jobs", json={"action": "refresh"})
        assert resp.status_code == 202
        body = resp.json()
        assert body["kind"] == "live_refresh"

        done = _wait_status(live_jobs_client, body["job_id"], {"succeeded", "failed"})
        assert done["status"] == "succeeded"
        # CLI 契約: 引数無しの live refresh --json（パラメータは forge.yaml 側）
        assert "ARGS: live refresh --json" in done["log_tail"]

    def test_不正なactionは422(self, live_jobs_client: TestClient) -> None:
        resp = live_jobs_client.post("/api/live/jobs", json={"action": "replay"})
        assert resp.status_code == 422

    def test_forge未導入なら503(self, live_jobs_client: TestClient) -> None:
        with mock.patch(
            "alpha_visualizer.routers.live.resolve_forge_exe", return_value=None
        ):
            resp = live_jobs_client.post("/api/live/jobs", json={"action": "refresh"})
        assert resp.status_code == 503
        assert resp.json()["code"] == "forge_cli_not_found"

    def test_非loopback公開中は403(self, tmp_path: pathlib.Path) -> None:
        app = create_app(forge_dir=tmp_path, local_write_enabled=False)
        with TestClient(app) as client:
            resp = client.post("/api/live/jobs", json={"action": "refresh"})
            assert resp.status_code == 403
            assert resp.json()["code"] == "local_write_disabled"
            # 参照系（GET /api/live）はガードの対象外
            assert client.get("/api/live").status_code == 200
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
uv run pytest tests/routers/test_live_jobs.py -v
```

Expected: FAIL（404 — エンドポイント未実装）

- [ ] **Step 3: 実装**

`src/alpha_visualizer/routers/live.py` に追加（既存 GET 2 本の後）:

```python
LOCAL_WRITE_DISABLED_MESSAGE = (
    "この操作は localhost でのみ利用できます（LAN 公開中は無効）"
    " / This operation is only available on localhost"
)


@router.post("/live/jobs", response_model=JobSummary, status_code=202)
async def create_live_job(
    body: CreateLiveJobRequest,
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """ライブ実績の一括更新（forge `live refresh`）ジョブを起動する。

    sync-events（SSH）・データ取得・DB 書き込みを伴う書き込み系のため、
    非 loopback 公開中は 403 で拒否する（routers/data.py と同じ方針）。
    forge 未導入はジョブを積んでから失敗させず、起動前に fail-fast する。
    replay パラメータは forge.yaml の `live.replay` が SSoT（リクエストに無い）。
    """
    assert body.action == "refresh"  # Literal で保証されるが、action 追加時の見落とし防止
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)
    if resolve_forge_exe() is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)

    record = await manager.create(kind="live_refresh", strategy_id="", symbol="")
    return _to_summary(record)
```

import 追加（ファイル冒頭。`routers/data.py` の import 群を参考に）:

```python
from fastapi import APIRouter, Depends, Query, Request

from alpha_visualizer.dependencies import get_job_manager
from alpha_visualizer.errors import ForgeCliNotFoundError, LocalWriteDisabledError
from alpha_visualizer.routers.jobs import JobSummary, _to_summary
from alpha_visualizer.schemas.live import CreateLiveJobRequest, LiveDetail, LiveListItem
from alpha_visualizer.services.forge_cli import FORGE_NOT_FOUND_MESSAGE, resolve_forge_exe
from alpha_visualizer.services.jobs import JobManager
```

- [ ] **Step 4: テストが通ることを確認**

```bash
uv run pytest tests/routers/test_live_jobs.py tests/routers/test_live.py -v
```

Expected: 全 PASS

- [ ] **Step 5: OpenAPI 型を再生成**

```bash
cd frontend && pnpm run gen
```

`frontend/openapi.json` と `frontend/src/api/types.gen.ts` に `CreateLiveJobRequest` と `/api/live/jobs` が入ることを git diff で確認。

- [ ] **Step 6: コミット**

```bash
git add src/alpha_visualizer/routers/live.py tests/routers/test_live_jobs.py frontend/openapi.json frontend/src/api/types.gen.ts
git commit -m "feat(api): POST /api/live/jobs で live refresh ジョブを起動できるようにする"
```

---

### Task 8: フロント API クライアント + hooks

**Files:**
- Modify: `frontend/src/api/types.ts`（`CreateLiveJobParams` を追加。`CreateDataJobParams` の定義行を見て同形で書く）
- Modify: `frontend/src/api/client.ts`（`createLiveJob` 追加）
- Modify: `frontend/src/hooks/useJobRunner.ts`（`useLiveRefreshRunner` 追加）
- Modify: `frontend/src/hooks/useLiveList.ts`（`reload` 追加）
- Test: `frontend/src/hooks/__tests__/useLiveList.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 7 の生成型（`types.gen.ts` の `CreateLiveJobRequest`）
- Produces:
  - `api.createLiveJob(params: CreateLiveJobParams): Promise<JobSummary>`
  - `useLiveRefreshRunner(onFinished?): UseJobRunnerResult<CreateLiveJobParams>`
  - `useLiveList(): LiveListState`（`reload: () => void` が増える）。Task 9 が使う。

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/__tests__/useLiveList.test.tsx`（新規。既存の hooks テスト —
`useStrategyList.test.tsx` 等 — の renderHook / vi.mock スタイルに合わせる）:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useLiveList } from '../useLiveList'
import { api } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: { listLive: vi.fn() },
}))

describe('useLiveList', () => {
  beforeEach(() => {
    // vi.mocked(...).mockResolvedValue はテスト間で持ち越されるため毎回明示再設定する
    vi.mocked(api.listLive).mockReset()
  })

  it('一覧を取得して返す', async () => {
    vi.mocked(api.listLive).mockResolvedValue([
      { strategy_id: 'pf_1', has_summary: true, has_trades: false, kind: 'position' },
    ])
    const { result } = renderHook(() => useLiveList())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
  })

  it('reload で再取得する', async () => {
    vi.mocked(api.listLive).mockResolvedValue([])
    const { result } = renderHook(() => useLiveList())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(api.listLive).mockResolvedValue([
      { strategy_id: 'pf_1', has_summary: true, has_trades: false, kind: 'position' },
    ])
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(vi.mocked(api.listLive)).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
cd frontend && pnpm vitest run src/hooks/__tests__/useLiveList.test.tsx
```

Expected: FAIL（`result.current.reload is not a function`）

- [ ] **Step 3: 実装**

`frontend/src/hooks/useLiveList.ts` を書き換え:

```typescript
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { LiveListItem } from '../api/types'

export interface LiveListState {
  items: LiveListItem[]
  loading: boolean
  error: string | null
  /** 一覧を再取得する（live refresh ジョブ成功後の反映用） */
  reload: () => void
}

/** ``GET /api/live`` の一覧を取得する（LivePage 用、#221）。 */
export function useLiveList(): LiveListState {
  const [items, setItems] = useState<LiveListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .listLive()
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  return { items, loading, error, reload }
}
```

`frontend/src/api/types.ts` — `CreateDataJobParams` の定義行を確認し、同じ書式で追加:

```typescript
export type CreateLiveJobParams = components['schemas']['CreateLiveJobRequest']
```

（`components` の import 名・エイリアスは既存定義に合わせる）

`frontend/src/api/client.ts` — `createDataJob`（69 行付近）の直後に追加:

```typescript
  // ライブ実績の一括更新（forge live refresh 委譲）
  createLiveJob: (params: CreateLiveJobParams): Promise<JobSummary> =>
    request<JobSummary>('/live/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
```

（`CreateLiveJobParams` を import に追加）

`frontend/src/hooks/useJobRunner.ts` — 末尾に追加:

```typescript
/**
 * ライブ実績の一括更新（live refresh）ジョブの起動・進捗購読・キャンセルを担う
 * フック。ジョブ作成は POST /api/live/jobs（`api.createLiveJob`）を使う点だけが
 * 異なり、残りは `useJobRunnerCore` を共有する。
 */
export function useLiveRefreshRunner(
  onFinished?: (status: JobStatus) => void,
): UseJobRunnerResult<CreateLiveJobParams> {
  return useJobRunnerCore(api.createLiveJob, onFinished)
}
```

（`CreateLiveJobParams` を import に追加）

- [ ] **Step 4: テストと型ゲートが通ることを確認**

```bash
cd frontend && pnpm vitest run src/hooks/__tests__/useLiveList.test.tsx && pnpm run build
```

Expected: PASS + ビルド成功（`tsc --noEmit` は no-op のため `pnpm run build` が型ゲート）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/hooks/useJobRunner.ts frontend/src/hooks/useLiveList.ts frontend/src/hooks/__tests__/useLiveList.test.tsx
git commit -m "feat(frontend): live refresh ジョブの API クライアントと hooks を追加"
```

---

### Task 9: Live ページ UI（更新ボタン + 進捗 + 完了時 refetch）

**Files:**
- Create: `frontend/src/components/live/LiveRefreshPanel.tsx`（Presentational）
- Modify: `frontend/src/screens/LiveScreen.tsx`（パネル配置 + detail 再取得 key）
- Modify: `frontend/src/pages/LivePage.tsx`（runner フック配線）
- Test: `frontend/src/components/live/__tests__/LiveRefreshPanel.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 8 の `useLiveRefreshRunner` / `useLiveList().reload`
- Produces: `LiveRefreshPanel` props: `{ lang: Lang; running: boolean; logLines: string[]; status: JobStatus | null; error: string | null; onStart: () => void }`。`LiveScreen` の props に `refresh: LiveRefreshPanelProps`（同 shape）と `detailReloadKey: number` が増える。

注: スペックの「`live_position_summaries.updated_at` を最終更新時刻として表示」は
`components/live/LivePositionView.tsx`（273 行付近）が既に表示済みのため**追加実装不要**。
refresh 成功時の `detailReloadKey` remount で updated_at も新しい値に更新される。

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/live/__tests__/LiveRefreshPanel.test.tsx`（新規。既存の
`components/live/__tests__/` のテストの render / スタイルに合わせる）:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveRefreshPanel } from '../LiveRefreshPanel'

describe('LiveRefreshPanel', () => {
  it('ボタン押下で onStart が呼ばれる', () => {
    const onStart = vi.fn()
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status={null}
        error={null}
        onStart={onStart}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ライブデータを更新' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('実行中はボタンが disabled でログ末尾が表示される', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={true}
        logLines={['[1/3] sync-events: 同期中...', '[2/3] data update: 市場データ更新中...']}
        status="running"
        error={null}
        onStart={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'ライブデータを更新' })).toBeDisabled()
    expect(screen.getByText(/data update/)).toBeInTheDocument()
  })

  it('失敗時はエラーを表示する', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status="failed"
        error="ステップ sync_events が失敗しました"
        onStart={vi.fn()}
      />,
    )
    expect(screen.getByText(/sync_events/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
cd frontend && pnpm vitest run src/components/live/__tests__/LiveRefreshPanel.test.tsx
```

Expected: FAIL（`LiveRefreshPanel` が存在しない）

- [ ] **Step 3: `LiveRefreshPanel` を実装**

`frontend/src/components/live/LiveRefreshPanel.tsx`（新規。DataPage の進捗表示
— button disabled + `<pre>` ログ末尾 + 失敗メッセージ — と同じ構成。スタイルは
既存 `components/live/` の inline style（design tokens 変数）に合わせる）:

```tsx
import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { JobStatus } from '../../api/types'

const LOG_TAIL_LINES = 20

export interface LiveRefreshPanelProps {
  lang: Lang
  running: boolean
  logLines: string[]
  status: JobStatus | null
  error: string | null
  onStart: () => void
}

/**
 * ライブデータ一括更新（forge live refresh）の起動ボタンと進捗表示。
 *
 * sync-events → data update → replay の進捗は forge が stderr に流す行を
 * ジョブ SSE 経由でそのまま表示する。パラメータは forge.yaml の live.replay が
 * SSoT のため入力 UI は無い。
 */
export function LiveRefreshPanel({
  lang,
  running,
  logLines,
  status,
  error,
  onStart,
}: LiveRefreshPanelProps): ReactElement {
  const L = makeL(lang)
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <button
        type="button"
        onClick={onStart}
        disabled={running}
        style={{ cursor: running ? 'default' : 'pointer' }}
      >
        {L('ライブデータを更新', 'Refresh live data')}
      </button>
      {running && (
        <pre
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            overflowX: 'auto',
          }}
        >
          {logLines.slice(-LOG_TAIL_LINES).join('\n')}
        </pre>
      )}
      {!running && status === 'failed' && error && (
        <div style={{ color: 'var(--danger)' }}>{error}</div>
      )}
    </div>
  )
}
```

（button / pre / div の具体的な style は既存 DataPage・LiveScreen の見た目に合わせて調整してよい。構造とテキストはテストと一致させること）

- [ ] **Step 4: `LiveScreen` / `LivePage` を配線**

`frontend/src/screens/LiveScreen.tsx`:
- props に `refresh: LiveRefreshPanelProps` と `detailReloadKey: number` を追加
- 一覧の上（`EntryList` の前後どちらか、レイアウト崩れの無い位置）に `<LiveRefreshPanel {...refresh} />` を配置
- `<LiveTab key={selectedId} ...>` → `<LiveTab key={`${selectedId}:${detailReloadKey}`} ...>`（refresh 成功時に詳細を再フェッチさせる）

`frontend/src/pages/LivePage.tsx`:

```tsx
  const { items, loading, error, reload } = useLiveList()
  const [detailReloadKey, setDetailReloadKey] = useState(0)
  const runner = useLiveRefreshRunner((status) => {
    if (status === 'succeeded') {
      reload()
      setDetailReloadKey((k) => k + 1)
    }
  })
```

`LiveScreen` へ渡す:

```tsx
    <LiveScreen
      ...既存 props...
      detailReloadKey={detailReloadKey}
      refresh={{
        lang,
        running: runner.running,
        logLines: runner.logLines,
        status: runner.status,
        error: runner.error,
        onStart: () => void runner.start({ action: 'refresh' }),
      }}
    />
```

（`useState` / `useLiveRefreshRunner` の import を追加）

- [ ] **Step 5: テスト・型・lint が通ることを確認**

```bash
cd frontend && pnpm vitest run && pnpm run build && pnpm run lint
```

Expected: 全 PASS（LiveScreen の既存テストが props 追加で落ちる場合は、テスト側に
`refresh` / `detailReloadKey` のダミー props を追加して修正する）

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/live/ frontend/src/screens/LiveScreen.tsx frontend/src/pages/LivePage.tsx
git commit -m "feat(live): Live ページにライブデータ一括更新ボタンと進捗表示を追加"
```

---

### Task 10: ドキュメント・スクリーンショット・フルゲート・PR

**Files:**
- Modify: `README.md` / `README.en.md`（Live ページの機能説明に更新ボタンを追記。**日英セット必須**）
- 再生成: `docs/screenshots/{ja,en}/`（Live ページに視覚変更があるため）
- alforge-labs のリンク PR: `mkdocs_src/{ja,en}/alpha-visualizer/` の Live ページ説明

- [ ] **Step 1: README 日英を更新**

Live ページの説明箇所に「更新ボタン（forge `live refresh` 委譲・forge.yaml の `live.replay` 設定が必要）」を 1-2 文で追記。ja / en 両方を同内容で更新する。

- [ ] **Step 2: スクリーンショット再撮影**

```bash
cd frontend
pnpm run e2e:install   # 初回のみ
pnpm run screenshots
```

注意（過去の罠）:
- RootLayout が参照する CLI 依存 API（`/api/agent/backends`・`/api/setup/status`）は撮影 describe 共通で `page.route` モックが必要（既存 capture.spec.ts に設定済みのはず。Live ページ撮影が新規に API を叩く場合は同様にモックを足す）
- ナビが写らない要素クロップ系 PNG（backtest-tv 等）に再撮影ジッタだけの差分が出たら `git checkout` で戻す

```bash
git add docs/screenshots/ README.md README.en.md
git commit -m "docs: Live 更新ボタンの説明とスクリーンショットを更新"
```

- [ ] **Step 3: バックエンド + フロントエンドのフルゲート**

```bash
uv run pytest
uv run ruff check src/ tests/
uv run mypy src/
cd frontend && pnpm vitest run && pnpm run build && pnpm run lint
```

各コマンド単独行で実行し exit code 確認。カバレッジ閾値（cov90）・vitest thresholds は CI と同じ基準で落ちないこと。既知のローカル限定失敗（serve 系のポート 8000 占有・E2E forge 未導入テスト）は該当したら CI に委ねる判断を明記する。

- [ ] **Step 4: PR 作成**

```bash
git push -u origin feat/live-refresh-gui
gh pr create --title "feat(live): Live ページからライブデータを一括更新できるようにする" --body-file /tmp/vis_pr_body.md
```

PR 本文: 概要 / スペックへのリンク（`docs/superpowers/specs/2026-08-06-live-refresh-gui-design.md` — 本 PR に同梱）/ forge 側 PR へのリンク / 旧 forge での degraded 動作（no such command 定型でエラー案内）/ テスト結果。
スペックと本計画ファイル（`docs/superpowers/plans/2026-08-06-live-refresh-gui.md`）もこの PR に含めてコミットする。

- [ ] **Step 5: labs ドキュメントのリンク PR**

alforge-labs 側 `mkdocs_src/{ja,en}/alpha-visualizer/` の Live ページ説明に更新ボタンを追記し、`uv run mkdocs build`（ja / en）→ 成果物コミット → リンク PR 作成（Task 5 と同じ手順・ブランチ名 `docs/live-refresh-gui`）。

---

## 実装順序と依存関係

```
Task 1 → Task 2 → Task 3 → Task 4（forge PR）→ Task 5（labs docs）
                                   ↓ （forge マージ・リリース後が理想。開発はスタブで並行可）
Task 6 → Task 7 → Task 8 → Task 9 → Task 10（visualizer PR + labs docs）
```

- visualizer 側テストはすべてスタブ forge で動くため、forge リリースを待たずに実装・マージ可能（実機確認だけは新 forge が必要）
- 実機スモーク（任意・マージ後）: forge リリース版を導入した環境で `alpha-vis serve --forge-dir ../alpha-strategies` → Live ページ → 更新ボタン → oracle-bot の `paper_trade_equity_snapshots.jsonl`（ground truth）と ±0.1% 以内で一致することを確認
