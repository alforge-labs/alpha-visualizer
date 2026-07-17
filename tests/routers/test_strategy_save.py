"""戦略パラメータ保存エンドポイント（POST /api/strategies/{id}/parameters）のテスト。

書き戻しは visualizer が直接ファイル・DB を書かず、``forge strategy save
--force`` に委譲する（single-writer 維持・forge 側 Pydantic 検証が SSoT）。
"""

from __future__ import annotations

import pathlib
from unittest import mock

from fastapi.testclient import TestClient


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


class TestSaveStrategyParameters:
    def test_save_success_runs_forge_strategy_save(
        self, client_with_strategies: TestClient
    ) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout="保存しました")
            ) as run_mock,
        ):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/parameters",
                json={"parameters": {"period": 30}},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["parameters"] == {"period": 30}

        args, kwargs = run_mock.call_args
        cmd = args[0]
        assert cmd[1:3] == ["strategy", "save"]
        assert cmd[-1] == "--force"
        assert kwargs["timeout"] == 60
        assert kwargs["env"]["FORGE_NONINTERACTIVE"] == "1"
        # 一時ファイルは成功後に削除されている
        tmp_file = pathlib.Path(cmd[3])
        assert not tmp_file.exists()

    def test_save_unknown_strategy_returns_404(
        self, client_with_strategies: TestClient
    ) -> None:
        resp = client_with_strategies.post(
            "/api/strategies/no-such-strategy/parameters",
            json={"parameters": {"period": 30}},
        )
        assert resp.status_code == 404

    def test_save_unknown_parameter_returns_400(
        self, client_with_strategies: TestClient
    ) -> None:
        resp = client_with_strategies.post(
            "/api/strategies/test_strategy/parameters",
            json={"parameters": {"nonexistent": 1}},
        )
        assert resp.status_code == 400

    def test_save_forge_not_found_returns_funnel_message(
        self, client_with_strategies: TestClient
    ) -> None:
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/parameters",
                json={"parameters": {"period": 30}},
            )
        assert resp.status_code == 500
        assert resp.json()["detail"].rsplit(" ", 1)[-1] == "https://alforgelabs.com"

    def test_save_forge_failure_returns_500_with_detail(
        self, client_with_strategies: TestClient
    ) -> None:
        """forge 側の検証エラー等はそのまま表面化させる（スキーマ SSoT は forge）"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stderr="Error: validation failed"),
            ),
        ):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/parameters",
                json={"parameters": {"period": 30}},
            )
        assert resp.status_code == 500
        assert "validation failed" in resp.json()["detail"]
