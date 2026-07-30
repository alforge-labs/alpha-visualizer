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


# --- issue #392: ロガー設定・ポート衝突・ブラウザ起動順序 ---------------------


def test_serve_help_has_log_level_option() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["serve", "--help"])
    assert result.exit_code == 0
    assert "--log-level" in result.output


def test_setup_logging_enables_info_diagnostics() -> None:
    """アプリロガー未設定だと INFO 診断が lastResort に落ちて消える (issue #392)。

    _setup_logging 後は alpha_visualizer.* の INFO が有効になること。
    """
    import logging

    from alpha_visualizer.cli import _setup_logging

    root = logging.getLogger()
    before_handlers = root.handlers[:]
    before_level = root.level
    try:
        _setup_logging("info")
        assert logging.getLogger("alpha_visualizer.app").isEnabledFor(logging.INFO)
        _setup_logging("debug")
        assert logging.getLogger("alpha_visualizer.app").isEnabledFor(logging.DEBUG)
    finally:
        root.handlers = before_handlers
        root.setLevel(before_level)


def test_serve_port_in_use_shows_friendly_error(tmp_path) -> None:
    """使用中ポートでは生の uvicorn エラーで死なず、--port 案内付きで失敗する。"""
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        port = sock.getsockname()[1]

        runner = CliRunner()
        result = runner.invoke(
            cli,
            [
                "serve",
                "--forge-dir",
                str(tmp_path),
                "--port",
                str(port),
                "--no-open",
            ],
        )

    assert result.exit_code != 0
    assert "使用中" in result.output
    assert "--port" in result.output


def test_open_browser_waits_for_server_startup() -> None:
    """ブラウザは bind 成功（server.started）後に開く (issue #392)。

    従来は uvicorn.run より先に webbrowser.open していたため、ポート衝突時に
    別プロセスの画面が開いた状態で CLI が死んでいた。
    """
    from alpha_visualizer.cli import _open_browser_when_started

    class FakeServer:
        def __init__(self) -> None:
            self.started = False
            self.should_exit = False

    opened: list[str] = []
    server = FakeServer()

    # 起動前は開かない → started で開く
    import threading

    t = threading.Thread(
        target=_open_browser_when_started,
        args=(server, "http://x", opened.append),
        kwargs={"poll_interval": 0.01},
    )
    t.start()
    assert opened == []
    server.started = True
    t.join(timeout=2)
    assert opened == ["http://x"]

    # 起動に失敗して終了フラグが立った場合は開かない
    opened.clear()
    failed = FakeServer()
    failed.should_exit = True
    _open_browser_when_started(failed, "http://x", opened.append, poll_interval=0.01)
    assert opened == []

def test_serve_non_loopback_bind_warns(tmp_path, monkeypatch) -> None:
    """--host 0.0.0.0 では破壊的 API が認証なしで公開される旨を警告する (issue #388)。"""
    import uvicorn

    monkeypatch.setattr(uvicorn.Server, "run", lambda self: None)

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["serve", "--forge-dir", str(tmp_path), "--host", "0.0.0.0", "--no-open"],
    )
    assert result.exit_code == 0
    assert "警告" in result.output
    assert "認証がなく" in result.output


def test_serve_loopback_bind_does_not_warn(tmp_path, monkeypatch) -> None:
    import uvicorn

    monkeypatch.setattr(uvicorn.Server, "run", lambda self: None)

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["serve", "--forge-dir", str(tmp_path), "--no-open"],
    )
    assert result.exit_code == 0
    assert "警告" not in result.output


# --- issue #400: CLI の日英併記と DB 不在警告の導線 ---------------------------


def test_serve_help_is_bilingual() -> None:
    """--help が README 等と同じ「日本語 / English」併記であること (issue #400)。

    最初の接点である CLI だけが日本語のみで、英語圏の PyPI ユーザーが
    --use-bundled-samples の説明を読めなかった。
    """
    runner = CliRunner()
    result = runner.invoke(cli, ["serve", "--help"])
    assert result.exit_code == 0
    # 代表的なオプションの説明に英語が併記されている
    assert "Host to bind" in result.output
    assert "Port number" in result.output
    assert "bundled sample" in result.output


def test_serve_db_missing_warning_offers_next_steps(tmp_path) -> None:
    """DB 不在警告がデッドエンドにならず、次の一歩を案内すること (issue #400)。"""
    import uvicorn

    monkeypatch_target = uvicorn.Server
    original = monkeypatch_target.run
    monkeypatch_target.run = lambda self: None
    try:
        runner = CliRunner()
        result = runner.invoke(
            cli, ["serve", "--forge-dir", str(tmp_path), "--no-open"]
        )
    finally:
        monkeypatch_target.run = original

    assert result.exit_code == 0
    assert "backtest_results.db" in result.output
    # サンプルモードの具体的なコマンドと FAQ への導線
    assert "--use-bundled-samples" in result.output
    assert "faq" in result.output.lower()
