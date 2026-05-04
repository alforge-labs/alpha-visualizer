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
    help="forge が生成する DB（exploration.db / forge.db）のディレクトリパス",
)
@click.option("--no-open", "no_open", is_flag=True, default=False, help="ブラウザを自動で開かない")
def serve(host: str, port: int, forge_dir: str, no_open: bool) -> None:
    """Web ダッシュボードを起動する"""
    import pathlib

    import uvicorn

    from alpha_visualizer.app import create_app

    forge_path = pathlib.Path(forge_dir).resolve()
    app = create_app(forge_dir=forge_path)

    url = f"http://{host}:{port}"
    click.echo(f"vis serve: {url}  (Ctrl+C で停止)")
    click.echo(f"forge-dir: {forge_path}")

    if not no_open:
        import webbrowser
        webbrowser.open(url)

    uvicorn.run(app, host=host, port=port)
    click.echo("vis serve を停止しました。")
