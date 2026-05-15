"""alpha-vis CLI の基本動作テスト"""

from click.testing import CliRunner

from alpha_visualizer import __version__
from alpha_visualizer.cli import cli


def test_help_exits_zero() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "alpha-visualizer" in result.output


def test_version() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert __version__ in result.output


def test_serve_help() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["serve", "--help"])
    assert result.exit_code == 0
    assert "--host" in result.output
    assert "--port" in result.output
    assert "--forge-dir" in result.output
    assert "--forge-config" in result.output


def test_pyproject_の_console_script_は_alpha_vis() -> None:
    """`vis` は macOS 標準 `/usr/bin/vis` と衝突するため、`alpha-vis` にリネーム済み。

    pyproject.toml `[project.scripts]` のエントリ名が `alpha-vis` であることを保証する
    ことで、誤って `vis` に戻されることを防ぐ。
    """
    import tomllib
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[1]
    with (repo_root / "pyproject.toml").open("rb") as f:
        data = tomllib.load(f)

    scripts = data["project"]["scripts"]
    assert "alpha-vis" in scripts, "console_script `alpha-vis` must be declared"
    assert "vis" not in scripts, (
        "console_script `vis` collides with macOS BSD vis(1); "
        "use `alpha-vis` (see issue: vis command name conflict)"
    )
    assert scripts["alpha-vis"] == "alpha_visualizer.cli:cli"
