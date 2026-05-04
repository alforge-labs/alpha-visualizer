"""FastAPI アプリケーションファクトリ"""
from __future__ import annotations

import pathlib

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers import ideas as ideas_router
from alpha_visualizer.routers import results as results_router
from alpha_visualizer.routers import strategies as strategies_router
from alpha_visualizer.routers import wfo as wfo_router


def create_app(forge_dir: pathlib.Path) -> FastAPI:
    config = ForgeConfig(forge_dir=forge_dir)
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

    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok", "forge_dir": str(forge_dir)})

    static_dir = pathlib.Path(__file__).parent / "static"
    if static_dir.exists():
        from fastapi.staticfiles import StaticFiles

        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")

    return app
