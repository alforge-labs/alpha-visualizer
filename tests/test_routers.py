"""ルーターエンドポイントのテスト（forge.db 不在時の挙動を確認）"""

import json
import pathlib

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app


@pytest.fixture()
def client(tmp_path: pathlib.Path) -> TestClient:
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


@pytest.fixture()
def client_with_strategies(tmp_path: pathlib.Path) -> TestClient:
    strategies_dir = tmp_path / "data" / "strategies"
    strategies_dir.mkdir(parents=True)
    (strategies_dir / "test_strategy.json").write_text(
        json.dumps({"strategy_id": "test_strategy", "name": "テスト戦略", "parameters": {"period": 20}}),
        encoding="utf-8",
    )
    ideas_dir = tmp_path / "data" / "ideas"
    ideas_dir.mkdir(parents=True)
    (ideas_dir / "ideas.json").write_text(
        json.dumps([{"idea_id": "idea_001", "title": "テストアイデア", "status": "pending"}]),
        encoding="utf-8",
    )
    app = create_app(forge_dir=tmp_path)
    return TestClient(app)


class TestResultsRouter:
    def test_list_results_empty_db(self, client: TestClient) -> None:
        """forge.db が存在しない場合は空リストを返す"""
        response = client.get("/api/results")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_results_with_strategy_filter(self, client: TestClient) -> None:
        """strategy_id クエリパラメータ付きで空リストを返す"""
        response = client.get("/api/results?strategy_id=some_strategy")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_results_since_invalid(self, client: TestClient) -> None:
        """since パラメータが不正な場合は 400 を返す"""
        response = client.get("/api/results?since=not-a-date")
        assert response.status_code == 400

    def test_get_result_not_found(self, client: TestClient) -> None:
        """forge.db が存在しない場合は 404 を返す"""
        response = client.get("/api/results/nonexistent_run")
        assert response.status_code == 404


class TestStrategiesRouter:
    def test_list_strategies_no_dir(self, client: TestClient) -> None:
        """strategies_dir が存在しない場合は空リストを返す"""
        response = client.get("/api/strategies")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_strategies_with_files(self, client_with_strategies: TestClient) -> None:
        """strategies_dir に JSON ファイルがある場合はリストを返す"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["strategy_id"] == "test_strategy"
        assert data[0]["name"] == "テスト戦略"

    def test_get_strategy_not_found(self, client: TestClient) -> None:
        """存在しない strategy_id は 404 を返す"""
        response = client.get("/api/strategies/nonexistent")
        assert response.status_code == 404

    def test_get_strategy_found(self, client_with_strategies: TestClient) -> None:
        """存在する strategy_id は詳細を返す"""
        response = client_with_strategies.get("/api/strategies/test_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["strategy_id"] == "test_strategy"
        assert data["parameters"]["period"] == 20

    def test_compare_strategies_empty_ids(self, client: TestClient) -> None:
        """ids が空の場合は 400 を返す"""
        response = client.get("/api/strategies/compare?ids=")
        assert response.status_code == 400

    def test_compare_strategies_not_found(self, client: TestClient) -> None:
        """バックテスト結果がない場合は 404 を返す"""
        response = client.get("/api/strategies/compare?ids=nonexistent")
        assert response.status_code == 404


class TestIdeasRouter:
    def test_list_ideas_no_file(self, client: TestClient) -> None:
        """ideas.json が存在しない場合は空リストを返す"""
        response = client.get("/api/ideas")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_ideas_with_data(self, client_with_strategies: TestClient) -> None:
        """ideas.json が存在する場合はリストを返す"""
        response = client_with_strategies.get("/api/ideas")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["idea_id"] == "idea_001"

    def test_list_ideas_status_filter(self, client_with_strategies: TestClient) -> None:
        """status フィルターが動作する"""
        response = client_with_strategies.get("/api/ideas?status=pending")
        assert response.status_code == 200
        assert len(response.json()) == 1

        response2 = client_with_strategies.get("/api/ideas?status=done")
        assert response2.status_code == 200
        assert len(response2.json()) == 0

    def test_get_idea_not_found(self, client: TestClient) -> None:
        """存在しない idea_id は 404 を返す"""
        response = client.get("/api/ideas/nonexistent")
        assert response.status_code == 404

    def test_get_idea_found(self, client_with_strategies: TestClient) -> None:
        """存在する idea_id は詳細を返す"""
        response = client_with_strategies.get("/api/ideas/idea_001")
        assert response.status_code == 200
        data = response.json()
        assert data["idea_id"] == "idea_001"


class TestWfoRouter:
    def test_wfo_no_db(self, client: TestClient) -> None:
        """forge.db が存在しない場合は 404 を返す"""
        response = client.get("/api/wfo/some_strategy")
        assert response.status_code == 404
