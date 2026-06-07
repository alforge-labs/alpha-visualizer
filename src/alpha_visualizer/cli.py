"""alpha-vis CLI エントリーポイント"""

import pathlib

import click

from alpha_visualizer import __version__


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
) -> None:
    """Web ダッシュボードを起動する"""
    import uvicorn

    from alpha_visualizer.app import create_app
    from alpha_visualizer.forge_config import ForgeConfig

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

    if not no_open:
        import webbrowser
        webbrowser.open(url)

    uvicorn.run(app, host=host, port=port)
    click.echo("alpha-vis serve を停止しました。")
