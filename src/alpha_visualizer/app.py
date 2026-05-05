"""FastAPI アプリケーションファクトリ"""
from __future__ import annotations

import pathlib

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse

from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers import ideas as ideas_router
from alpha_visualizer.routers import results as results_router
from alpha_visualizer.routers import run as run_router
from alpha_visualizer.routers import strategies as strategies_router
from alpha_visualizer.routers import wfo as wfo_router


def create_app(
    forge_dir: pathlib.Path | None = None,
    *,
    config: ForgeConfig | None = None,
) -> FastAPI:
    """FastAPI アプリを生成する。

    引数は次のいずれかを満たす必要がある:
    - ``config``: 解決済みの ``ForgeConfig`` を直接渡す（推奨）
    - ``forge_dir``: ディレクトリパスを渡し、内部で ``ForgeConfig.from_forge_dir`` を呼ぶ
      （後方互換）

    両方渡された場合は ``config`` が優先される。
    """
    if config is None:
        if forge_dir is None:
            raise ValueError("forge_dir または config のいずれかを指定してください")
        config = ForgeConfig.from_forge_dir(pathlib.Path(forge_dir))

    app = FastAPI(
        title="alpha-visualizer",
        description="AlphaForge バックテスト結果の Web 可視化ツール",
        version="0.1.0",
    )
    app.state.forge_config = config

    app.include_router(results_router.router, prefix="/api")
    app.include_router(strategies_router.router, prefix="/api")
    app.include_router(ideas_router.router, prefix="/api")
    app.include_router(wfo_router.router, prefix="/api")
    app.include_router(run_router.router, prefix="/api")

    forge_dir_str = str(config.forge_dir)

    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok", "forge_dir": forge_dir_str})

    static_dir = pathlib.Path(__file__).parent / "static"
    if static_dir.exists():
        index_html = static_dir / "index.html"
        static_root = static_dir.resolve()

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str) -> FileResponse:
            """SPA ルート対応: /api 配下以外で実ファイルがあればそれを返し、
            無ければ index.html を返して history mode の直アクセス・リロードに対応する。
            """
            requested = (static_dir / full_path).resolve()
            # ディレクトリトラバーサル対策
            try:
                requested.relative_to(static_root)
            except ValueError:
                return FileResponse(index_html)
            if requested.is_file():
                return FileResponse(requested)
            return FileResponse(index_html)

    return app
