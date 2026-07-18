"""戦略複製エンドポイント（POST /api/strategies/{id}/duplicate）のテスト（vis#301）。

複製は visualizer が直接ファイル・DB を書かず、strategy_id を差し替えた一時
JSON を ``forge strategy save``（--force **なし**）へ委譲する。--force を
付けないことで ID 衝突は forge 側で拒否され、既存戦略の誤上書きを防ぐ。
"""

from __future__ import annotations

import json
import pathlib
from unittest import mock

from fastapi.testclient import TestClient


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


class TestDuplicateStrategy:
    def test_duplicate_success_runs_forge_save_without_force(
        self, client_with_strategies: TestClient
    ) -> None:
        captured: dict[str, object] = {}

        def _fake_run(cmd: list[str], **kwargs: object) -> mock.Mock:
            # subprocess 実行時点の一時ファイル内容を検証する（実行後は削除される）
            captured["cmd"] = cmd
            captured["definition"] = json.loads(
                pathlib.Path(cmd[3]).read_text(encoding="utf-8")
            )
            return _proc(stdout="登録しました")

        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", side_effect=_fake_run),
        ):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/duplicate",
                json={"new_strategy_id": "test_strategy_v2"},
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "ok"
        assert body["strategy_id"] == "test_strategy_v2"

        cmd = captured["cmd"]
        assert cmd[1:3] == ["strategy", "save"]
        # 誤上書き防止: 新規作成は --force を付けない（ID 衝突は forge が拒否）
        assert "--force" not in cmd

        definition = captured["definition"]
        assert definition["strategy_id"] == "test_strategy_v2"
        # strategy_id 以外（パラメータ等）は元定義を保持する
        assert definition["parameters"] == {"period": 20}
        assert definition["name"] == "テスト戦略"

        # 一時ファイルは成功後に削除されている
        assert not pathlib.Path(cmd[3]).exists()

    def test_duplicate_unknown_source_returns_404(
        self, client_with_strategies: TestClient
    ) -> None:
        resp = client_with_strategies.post(
            "/api/strategies/no_such_strategy/duplicate",
            json={"new_strategy_id": "whatever_v2"},
        )
        assert resp.status_code == 404

    def test_duplicate_existing_id_returns_409(
        self, client_with_strategies: TestClient
    ) -> None:
        """既存 ID への複製は forge を呼ばずに 409 で拒否する。"""
        with mock.patch("subprocess.run") as run_mock:
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/duplicate",
                json={"new_strategy_id": "test_strategy"},
            )
        assert resp.status_code == 409
        run_mock.assert_not_called()

    def test_duplicate_invalid_id_is_rejected(
        self, client_with_strategies: TestClient
    ) -> None:
        """ID に使えない文字（パストラバーサル含む）はスキーマ検証で拒否する。"""
        for bad_id in ("../evil", "a/b", "", "日本語", ".hidden"):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/duplicate",
                json={"new_strategy_id": bad_id},
            )
            assert resp.status_code == 422, f"{bad_id!r}: {resp.status_code}"

    def test_forge_failure_returns_500_and_cleans_temp_file(
        self, client_with_strategies: TestClient
    ) -> None:
        captured: dict[str, object] = {}

        def _fake_run(cmd: list[str], **kwargs: object) -> mock.Mock:
            captured["cmd"] = cmd
            return _proc(returncode=1, stderr="エラー: 既存の戦略と内容が異なります")

        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", side_effect=_fake_run),
        ):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/duplicate",
                json={"new_strategy_id": "test_strategy_v3"},
            )

        assert resp.status_code == 500
        assert "既存の戦略と内容が異なります" in resp.json()["detail"]
        assert not pathlib.Path(str(captured["cmd"][3])).exists()

    def test_forge_not_found_returns_funnel_message(
        self, client_with_strategies: TestClient
    ) -> None:
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_strategies.post(
                "/api/strategies/test_strategy/duplicate",
                json={"new_strategy_id": "test_strategy_v4"},
            )
        assert resp.status_code == 500
        assert "alforgelabs.com" in resp.json()["detail"]
