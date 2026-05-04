"""FastAPI アプリの基本テスト"""

import pathlib

from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app


def test_health_returns_ok(tmp_path: pathlib.Path) -> None:
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert str(tmp_path) in data["forge_dir"]
