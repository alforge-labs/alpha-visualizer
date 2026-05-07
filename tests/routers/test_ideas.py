"""ideas ルーターのテスト。"""

from __future__ import annotations

from fastapi.testclient import TestClient


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
