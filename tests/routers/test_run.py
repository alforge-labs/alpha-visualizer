"""run ルーターのテスト（forge コマンド呼び出し）。"""

from __future__ import annotations

from unittest import mock

from fastapi.testclient import TestClient


class TestRunRouter:
    def test_run_success(self, client_with_db: TestClient) -> None:
        """forge コマンドが成功したとき run_id と status="ok" を返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL", "timeframe": "1d"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["run_id"] == "run-abc123"
        assert body["status"] == "ok"

    def test_run_forge_not_found(self, client_with_db: TestClient) -> None:
        """forge コマンドが PATH にないとき 500 を返す"""
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL", "timeframe": "1d"},
            )
        assert resp.status_code == 500
        assert "forge" in resp.json()["detail"].lower()

    def test_run_subprocess_failure(self, client_with_db: TestClient) -> None:
        """forge コマンドが非ゼロで終了したとき 500 を返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=mock.Mock(
                    returncode=1, stdout="", stderr="Error: strategy not found"
                ),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL", "timeframe": "1d"},
            )
        assert resp.status_code == 500
        assert "Error: strategy not found" in resp.json()["detail"]
