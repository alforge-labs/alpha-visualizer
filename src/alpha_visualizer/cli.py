"""vis CLI エントリーポイント"""

import click

from alpha_visualizer import __version__


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
    help="forge.yaml のパス。未指定なら $FORGE_CONFIG → <forge-dir>/forge.yaml の順で探索",
)
@click.option("--no-open", "no_open", is_flag=True, default=False, help="ブラウザを自動で開かない")
def serve(
    host: str,
    port: int,
    forge_dir: str,
    forge_config: str | None,
    no_open: bool,
) -> None:
    """Web ダッシュボードを起動する"""
    import pathlib

    import uvicorn

    from alpha_visualizer.app import create_app
    from alpha_visualizer.forge_config import ForgeConfig

    forge_path = pathlib.Path(forge_dir).resolve()
    config_path = pathlib.Path(forge_config).resolve() if forge_config else None
    config = ForgeConfig.from_forge_dir(forge_path, config_path=config_path)
    app = create_app(config=config)

    url = f"http://{host}:{port}"
    click.echo(f"vis serve: {url}  (Ctrl+C で停止)")
    click.echo(f"forge-dir: {forge_path}")
    click.echo(f"forge-db:  {config.forge_db}")
    if not config.forge_db.exists():
        click.echo("  ⚠ forge.db が見つかりません（関連 API は 404 を返します）")
    if config.strategies_db is not None:
        click.echo(f"strategies-db: {config.strategies_db}")
    else:
        click.echo(f"strategies-dir: {config.strategies_dir} (JSON モード)")

    if not no_open:
        import webbrowser
        webbrowser.open(url)

    uvicorn.run(app, host=host, port=port)
    click.echo("vis serve を停止しました。")
