"""dependencies モジュールの test"""
from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from alpha_visualizer.db import get_engine
from alpha_visualizer.dependencies import get_engine_dep, get_forge_config_dep
from alpha_visualizer.forge_config import ForgeConfig


def _build_app(tmp_path: Path) -> FastAPI:
    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)
    (forge_dir / "data" / "results" / "forge.db").touch()
    cfg = ForgeConfig.from_forge_dir(forge_dir)

    app = FastAPI()
    app.state.forge_config = cfg
    app.state.engine = get_engine(cfg.forge_db)
    return app


def test_get_forge_config_dep_returns_app_state_config(tmp_path: Path) -> None:
    app = _build_app(tmp_path)

    @app.get("/probe")
    def probe(
        cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    ) -> dict[str, str]:
        return {"forge_dir": str(cfg.forge_dir)}

    client = TestClient(app)
    res = client.get("/probe")
    assert res.status_code == 200
    assert res.json()["forge_dir"].endswith("forge")


def test_get_engine_dep_returns_app_state_engine(tmp_path: Path) -> None:
    app = _build_app(tmp_path)

    @app.get("/probe-engine")
    def probe(
        engine: Annotated[Engine, Depends(get_engine_dep)],
    ) -> dict[str, str]:
        return {"name": engine.dialect.name}

    client = TestClient(app)
    res = client.get("/probe-engine")
    assert res.status_code == 200
    assert res.json() == {"name": "sqlite"}
