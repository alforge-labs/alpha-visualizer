"""ForgeConfig.from_forge_dir の単体テスト

forge.yaml の有無、相対パス解決、環境変数優先、明示指定優先を検証する。
"""

from __future__ import annotations

import pathlib
import textwrap

import pytest

from alpha_visualizer.forge_config import ForgeConfig


def _write_yaml(path: pathlib.Path, body: str) -> None:
    path.write_text(textwrap.dedent(body).strip() + "\n", encoding="utf-8")


class TestForgeConfigFallback:
    def test_no_yaml_uses_defaults(self, tmp_path: pathlib.Path) -> None:
        """forge.yaml が存在しない場合は既存ハードコード値にフォールバックする"""
        config = ForgeConfig.from_forge_dir(tmp_path)

        assert config.forge_dir == tmp_path
        assert config.forge_db == tmp_path / "data" / "results" / "backtest_results.db"
        assert config.strategies_dir == tmp_path / "data" / "strategies"
        assert config.strategies_db is None
        assert config.ideas_json == tmp_path / "data" / "ideas" / "ideas.json"
        assert config.live_dir == tmp_path / "data" / "live"

    def test_empty_yaml_uses_defaults(self, tmp_path: pathlib.Path) -> None:
        """forge.yaml が空（None）の場合もデフォルトにフォールバックする"""
        (tmp_path / "forge.yaml").write_text("", encoding="utf-8")
        config = ForgeConfig.from_forge_dir(tmp_path)

        assert config.forge_db == tmp_path / "data" / "results" / "backtest_results.db"
        assert config.strategies_db is None


class TestForgeConfigYamlReflection:
    def test_report_db_filename_reflected(self, tmp_path: pathlib.Path) -> None:
        """report.db_filename を反映する"""
        _write_yaml(
            tmp_path / "forge.yaml",
            """
            report:
              output_path: ./data/results
              db_filename: backtest_results.db
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.forge_db == tmp_path / "data" / "results" / "backtest_results.db"

    def test_strategies_use_db_true(self, tmp_path: pathlib.Path) -> None:
        """strategies.use_db: true のとき strategies_db が解決される"""
        _write_yaml(
            tmp_path / "forge.yaml",
            """
            strategies:
              path: ./data/strategies
              use_db: true
              db_filename: my_strategies.db
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.strategies_dir == tmp_path / "data" / "strategies"
        assert config.strategies_db == tmp_path / "data" / "strategies" / "my_strategies.db"

    def test_strategies_use_db_false(self, tmp_path: pathlib.Path) -> None:
        """strategies.use_db: false のとき strategies_db は None"""
        _write_yaml(
            tmp_path / "forge.yaml",
            """
            strategies:
              path: ./data/strategies
              use_db: false
              db_filename: ignored.db
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.strategies_db is None

    def test_ideas_path_reflected(self, tmp_path: pathlib.Path) -> None:
        """ideas.ideas_path を反映する"""
        _write_yaml(
            tmp_path / "forge.yaml",
            """
            ideas:
              ideas_path: ./custom/ideas
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.ideas_json == tmp_path / "custom" / "ideas" / "ideas.json"

    def test_live_output_path_reflected(self, tmp_path: pathlib.Path) -> None:
        """live.output_path を反映する"""
        _write_yaml(
            tmp_path / "forge.yaml",
            """
            live:
              output_path: ./custom/live
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.live_dir == tmp_path / "custom" / "live"

    def test_live_default_when_section_missing(self, tmp_path: pathlib.Path) -> None:
        """live セクションが無い場合は <forge_dir>/data/live を使う"""
        _write_yaml(
            tmp_path / "forge.yaml",
            """
            report:
              output_path: ./data/results
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.live_dir == tmp_path / "data" / "live"


class TestForgeConfigPathResolution:
    def test_relative_path_resolved_against_yaml_dir(
        self, tmp_path: pathlib.Path
    ) -> None:
        """相対パスは forge.yaml の親ディレクトリ基準で絶対化される"""
        nested = tmp_path / "nested"
        nested.mkdir()
        _write_yaml(
            nested / "forge.yaml",
            """
            report:
              output_path: ./data/results
              db_filename: x.db
            """,
        )
        # forge_dir 引数とは別に forge.yaml は nested 配下にある
        config = ForgeConfig.from_forge_dir(tmp_path, config_path=nested / "forge.yaml")
        assert config.forge_db == nested / "data" / "results" / "x.db"

    def test_absolute_path_kept(self, tmp_path: pathlib.Path) -> None:
        """絶対パスはそのまま尊重される"""
        abs_results = tmp_path / "abs_results"
        _write_yaml(
            tmp_path / "forge.yaml",
            f"""
            report:
              output_path: {abs_results}
              db_filename: x.db
            """,
        )
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.forge_db == abs_results / "x.db"


class TestForgeConfigSearchOrder:
    def test_explicit_config_path_wins(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """引数で明示指定された config_path が最優先"""
        explicit = tmp_path / "explicit.yaml"
        env = tmp_path / "env.yaml"
        forge_local = tmp_path / "forge.yaml"
        _write_yaml(explicit, "report:\n  db_filename: explicit.db")
        _write_yaml(env, "report:\n  db_filename: env.db")
        _write_yaml(forge_local, "report:\n  db_filename: local.db")
        monkeypatch.setenv("FORGE_CONFIG", str(env))

        config = ForgeConfig.from_forge_dir(tmp_path, config_path=explicit)
        assert config.forge_db.name == "explicit.db"

    def test_env_var_used_when_no_explicit(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """明示指定なしのとき FORGE_CONFIG が forge_dir/forge.yaml より優先"""
        env = tmp_path / "env.yaml"
        forge_local = tmp_path / "forge.yaml"
        _write_yaml(env, "report:\n  db_filename: env.db")
        _write_yaml(forge_local, "report:\n  db_filename: local.db")
        monkeypatch.setenv("FORGE_CONFIG", str(env))

        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.forge_db.name == "env.db"

    def test_forge_dir_yaml_used_as_last_resort(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """環境変数なし・明示なしのとき forge_dir/forge.yaml を使う"""
        monkeypatch.delenv("FORGE_CONFIG", raising=False)
        _write_yaml(tmp_path / "forge.yaml", "report:\n  db_filename: local.db")
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.forge_db.name == "local.db"

    def test_missing_env_var_path_falls_through(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """FORGE_CONFIG が存在しないパスを指している場合はデフォルトに落とす"""
        monkeypatch.setenv("FORGE_CONFIG", str(tmp_path / "nonexistent.yaml"))
        config = ForgeConfig.from_forge_dir(tmp_path)
        assert config.forge_db.name == "backtest_results.db"
