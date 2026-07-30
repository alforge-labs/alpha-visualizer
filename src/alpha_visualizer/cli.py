"""alpha-vis CLI エントリーポイント"""

import logging
import pathlib
import socket
import time
from collections.abc import Callable
from typing import Any

import click

from alpha_visualizer import __version__


def _setup_logging(level_name: str) -> None:
    """アプリロガー（alpha_visualizer.*）を設定する (issue #392)。

    未設定だと Python の lastResort ハンドラ（WARNING 以上・タイムスタンプ
    なしの裸メッセージ）に落ち、コード中の INFO 診断（FORGE_CONFIG
    フォールバック採用・run_id DB フォールバック等）がどこにも出ない。
    """
    level = getattr(logging, level_name.upper(), logging.INFO)
    # force=True: 既に root ハンドラがある場合（テストランナー等）でも
    # 指定レベル・書式で確実に再設定する
    logging.basicConfig(
        level=level,
        # uvicorn の levelprefix と揃えた簡潔な書式
        format="%(levelname)s:     %(name)s - %(message)s",
        force=True,
    )


def _ensure_port_available(host: str, port: int) -> None:
    """bind 前にポートの空きを確認し、使用中なら案内付きで失敗させる。

    従来は uvicorn の bind 失敗より先にブラウザが開き、生の uvicorn エラーで
    死んでいた (issue #392)。事前チェックには TOCTOU の余地があるが、
    典型的な「前回の serve が残っている」ケースを親切に落とすには十分。
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError as exc:
            raise click.ClickException(
                f"ポート {port} は使用中です（別の alpha-vis serve が動いていませんか？）。"
                "--port で別のポート番号を指定してください。"
            ) from exc


def _open_browser_when_started(
    server: Any,
    url: str,
    opener: Callable[[str], object],
    *,
    poll_interval: float = 0.1,
) -> None:
    """uvicorn Server の bind 完了（started）を待ってからブラウザを開く。

    起動に失敗した場合（should_exit）は開かない (issue #392)。
    """
    while not server.started:
        if server.should_exit:
            return
        time.sleep(poll_interval)
    opener(url)


def _resolve_bundled_samples() -> pathlib.Path | None:
    """OSS 同梱の ``samples/sample-forge`` パスを解決する。

    1. wheel/sdist 同梱版: ``alpha_visualizer/samples/sample-forge``（``force-include``
       で配置）
    2. 開発環境（editable install）: リポジトリ直下 ``samples/sample-forge``

    どちらにも存在しない場合は ``None`` を返す。
    """
    pkg_dir = pathlib.Path(__file__).resolve().parent
    bundled = pkg_dir / "samples" / "sample-forge"
    if bundled.is_dir():
        return bundled
    # 開発環境フォールバック: src/alpha_visualizer/cli.py の 2 つ上が repo root
    repo_root = pkg_dir.parent.parent
    dev_path = repo_root / "samples" / "sample-forge"
    if dev_path.is_dir():
        return dev_path
    return None


@click.group()
@click.version_option(version=__version__, prog_name="alpha-visualizer")
def cli() -> None:
    """alpha-visualizer - AlphaForge バックテスト結果の Web 可視化ツール"""


@cli.command("serve")
@click.option("--host", default="127.0.0.1", show_default=True, help="バインドするホスト名")
@click.option("--port", default=8000, show_default=True, help="ポート番号")
@click.option(
    "--forge-dir",
    default=".",
    show_default=True,
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    help="forge が生成するデータディレクトリのパス",
)
@click.option(
    "--forge-config",
    "forge_config",
    default=None,
    type=click.Path(exists=False, file_okay=True, dir_okay=False),
    help="forge.yaml のパス。未指定なら <forge-dir>/forge.yaml → $FORGE_CONFIG の順で探索",
)
@click.option("--no-open", "no_open", is_flag=True, default=False, help="ブラウザを自動で開かない")
@click.option(
    "--log-level",
    "log_level",
    default="info",
    show_default=True,
    type=click.Choice(["debug", "info", "warning", "error"], case_sensitive=False),
    help="ログの冗長度（alpha_visualizer.* と uvicorn に適用）",
)
@click.option(
    "--use-bundled-samples",
    "use_bundled_samples",
    is_flag=True,
    default=False,
    help=(
        "OSS 同梱の合成サンプル forge_dir を使う。指定時は --forge-dir / --forge-config は無視される。"
    ),
)
def serve(
    host: str,
    port: int,
    forge_dir: str,
    forge_config: str | None,
    no_open: bool,
    use_bundled_samples: bool,
    log_level: str,
) -> None:
    """Web ダッシュボードを起動する"""
    import uvicorn

    from alpha_visualizer.app import create_app
    from alpha_visualizer.forge_config import ForgeConfig

    _setup_logging(log_level)
    _ensure_port_available(host, port)

    if use_bundled_samples:
        bundled = _resolve_bundled_samples()
        if bundled is None:
            raise click.ClickException(
                "同梱サンプル sample-forge/ が見つかりません。"
                "開発環境では `uv run python samples/build_samples.py` を先に実行してください。"
            )
        forge_path = bundled
        config_path = None
        click.echo(f"(bundled samples) forge-dir = {forge_path}")
    else:
        forge_path = pathlib.Path(forge_dir).resolve()
        config_path = pathlib.Path(forge_config).resolve() if forge_config else None
    config = ForgeConfig.from_forge_dir(forge_path, config_path=config_path)
    app = create_app(config=config)

    url = f"http://{host}:{port}"
    click.echo(f"alpha-vis serve: {url}  (Ctrl+C で停止)")
    click.echo(f"forge-dir: {forge_path}")
    click.echo(f"forge-db:  {config.forge_db}")
    if not config.forge_db.exists():
        click.echo(
            "  ⚠ backtest_results.db が見つかりません"
            "（空 DB として扱います。一覧 API は空配列・個別取得 API は 404 を返します）"
        )
    if config.strategies_db is not None:
        click.echo(f"strategies-db: {config.strategies_db}")
    else:
        click.echo(f"strategies-dir: {config.strategies_dir} (JSON モード)")

    click.echo(
        "Powered by AlphaForge — フル機能のバックテスト/最適化エンジン: https://alforgelabs.com"
    )

    # ブラウザは bind 成功後に開く (issue #392)。ポート衝突等で起動に
    # 失敗したとき、別プロセスの画面や接続エラーを見せないため
    uv_config = uvicorn.Config(app, host=host, port=port, log_level=log_level.lower())
    server = uvicorn.Server(uv_config)
    if not no_open:
        import threading
        import webbrowser

        threading.Thread(
            target=_open_browser_when_started,
            args=(server, url, webbrowser.open),
            daemon=True,
        ).start()

    server.run()
    click.echo("alpha-vis serve を停止しました。")
