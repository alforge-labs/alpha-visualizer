"""FastAPI アプリケーションファクトリ"""

import pathlib

from fastapi import FastAPI
from fastapi.responses import JSONResponse


def create_app(forge_dir: pathlib.Path) -> FastAPI:
    app = FastAPI(
        title="alpha-visualizer",
        description="AlphaForge バックテスト結果の Web 可視化ツール",
        version="0.1.0",
    )
    app.state.forge_dir = forge_dir

    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok", "forge_dir": str(forge_dir)})

    return app
