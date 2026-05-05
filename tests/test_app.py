"""FastAPI アプリの基本テスト"""

import pathlib

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig


def test_health_returns_ok(tmp_path: pathlib.Path) -> None:
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert str(tmp_path) in data["forge_dir"]


def test_create_app_accepts_config(tmp_path: pathlib.Path) -> None:
    """config キーワードで ForgeConfig を直接渡せる"""
    config = ForgeConfig.from_forge_dir(tmp_path)
    app = create_app(config=config)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200


def test_create_app_requires_argument() -> None:
    """forge_dir も config もどちらも与えないと ValueError"""
    with pytest.raises(ValueError):
        create_app()
