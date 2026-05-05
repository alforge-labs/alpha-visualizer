"""vis CLI の基本動作テスト"""

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
