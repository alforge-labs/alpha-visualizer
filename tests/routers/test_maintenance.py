"""maintenance ルーターのテスト（forge CLI 委譲）。"""

from __future__ import annotations

import json
from unittest import mock

from fastapi.testclient import TestClient

# フェーズ1 の CLI が返す JSON（実データの形をそのまま縮めたもの）
CLI_LIST_JSON = json.dumps({
    "orphans": [
        {
            "strategy_id": "lev_tmp",
            "backtest_run_count": 20,
            "optimization_run_count": 0,
            "bytes": 5856500,
            "first_run_at": "2026-06-08T14:05:30.187973+00:00",
            "last_run_at": "2026-06-08T14:07:20.920498+00:00",
        },
        {
            "strategy_id": "a158_sma_base",
            "backtest_run_count": 1,
            "optimization_run_count": 2,
            "bytes": 1024,
            "first_run_at": "2026-05-11T00:00:00+00:00",
            "last_run_at": "2026-05-12T00:00:00+00:00",
        },
    ],
    "count": 2,
    "total_bytes": 5857524,
    "dry_run": True,
    "deleted": None,
})

CLI_DELETE_JSON = json.dumps({
    "orphans": [],
    "count": 0,
    "total_bytes": 0,
    "dry_run": False,
    "deleted": {
        "strategy_ids": ["lev_tmp"],
        "backtest_rows": 20,
        "optimization_rows": 0,
        "bytes_before": 227000000,
        "bytes_after": 221000000,
        "vacuum_error": None,
    },
})


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


class TestOrphanRunsList:
    def test_CLI_の_json_をそのまま返す(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_LIST_JSON)) as run_mock,
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 2
        assert body["total_bytes"] == 5857524
        assert [o["strategy_id"] for o in body["orphans"]] == ["lev_tmp", "a158_sma_base"]
        assert body["orphans"][0]["optimization_run_count"] == 0
        assert body["orphans"][1]["optimization_run_count"] == 2

        # 一覧は必ず読み取り専用で呼ぶ。--dry-run が無いと実削除になる
        argv = run_mock.call_args[0][0]
        assert "prune-orphans" in argv
        assert "--dry-run" in argv
        assert "--json" in argv
        assert "-y" not in argv
        assert "--vacuum" not in argv

    def test_孤児0件なら空配列を返す(self, client_with_db: TestClient) -> None:
        empty = json.dumps({
            "orphans": [], "count": 0, "total_bytes": 0, "dry_run": True, "deleted": None,
        })
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=empty)),
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code == 200
        assert resp.json()["orphans"] == []
        assert resp.json()["count"] == 0

    def test_forge未導入なら導線付きのエラーを返す(self, client_with_db: TestClient) -> None:
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code >= 400
        assert "alforgelabs.com" in json.dumps(resp.json(), ensure_ascii=False)

    def test_forgeが非ゼロ終了したらエラーにする(self, client_with_db: TestClient) -> None:
        # 成功に見せてはいけない。空一覧を返すと「掃除済み」と誤読される。
        # stdout に有効な JSON を混ぜて returncode チェック自体の判別力を担保する
        # （stdout が空だと JSON パース失敗経由でも偶然 4xx/5xx になり、
        # returncode チェックが抜けていても検出できないため）。
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stdout=CLI_LIST_JSON, stderr="boom"),
            ),
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code >= 400

    def test_stdoutが壊れていたらエラーにする(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout="not json at all")),
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code >= 400


class TestOrphanRunsDelete:
    def test_選択したIDだけをstrategyオプションで渡す(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_DELETE_JSON)) as run_mock,
        ):
            resp = client_with_db.request(
                "DELETE",
                "/api/maintenance/orphan-runs",
                json={"strategy_ids": ["lev_tmp", "a158_sma_base"]},
            )

        assert resp.status_code == 200
        argv = run_mock.call_args[0][0]
        assert "-y" in argv
        assert "--vacuum" in argv
        assert "--json" in argv
        assert "--dry-run" not in argv
        # 選択した 2 件が --strategy で渡ること
        pairs = [(argv[i], argv[i + 1]) for i in range(len(argv) - 1) if argv[i] == "--strategy"]
        assert pairs == [("--strategy", "lev_tmp"), ("--strategy", "a158_sma_base")]

    def test_空の選択ではforgeを呼ばない(self, client_with_db: TestClient) -> None:
        """CLI は --strategy 省略時に全孤児を削除する。

        空配列をそのまま組み立てると、選択 0 件の削除が全件削除になる。
        この機能で最も危険な経路なのでガードを固定する。
        """
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_DELETE_JSON)) as run_mock,
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": []},
            )

        assert resp.status_code == 400
        run_mock.assert_not_called()

    def test_削除結果を返す(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_DELETE_JSON)),
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        body = resp.json()
        assert body["deleted_strategy_ids"] == ["lev_tmp"]
        assert body["deleted_backtest_rows"] == 20
        assert body["deleted_optimization_rows"] == 0
        assert body["reclaimed_bytes"] == 227000000 - 221000000
        assert body["vacuum_error"] is None

    def test_vacuum失敗を区別して返す(self, client_with_db: TestClient) -> None:
        """削除は完了しているので成功扱いにしつつ、容量回収の失敗は伝える。"""
        payload = json.loads(CLI_DELETE_JSON)
        payload["deleted"]["vacuum_error"] = "database is locked"
        payload["deleted"]["bytes_after"] = payload["deleted"]["bytes_before"]
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=json.dumps(payload))),
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["vacuum_error"] == "database is locked"
        assert body["reclaimed_bytes"] == 0
        assert body["deleted_backtest_rows"] == 20

    def test_subprocess起動前にengineをdisposeする(self, client_with_db: TestClient) -> None:
        """VACUUM は DB 全体の排他ロックを取る。

        この画面は直読みしないが、他画面が同じ Engine を使っており接続が残る。
        dispose を忘れると forge が database is locked で exit 1 になる。
        """
        calls: list[str] = []
        engine = client_with_db.app.state.engine

        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch.object(
                engine, "dispose", side_effect=lambda *a, **k: calls.append("dispose")
            ),
            mock.patch(
                "subprocess.run",
                side_effect=lambda *a, **k: (calls.append("subprocess"), _proc(stdout=CLI_DELETE_JSON))[1],
            ),
        ):
            client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        assert calls == ["dispose", "subprocess"]

    def test_forgeが非ゼロ終了したら削除もエラーにする(self, client_with_db: TestClient) -> None:
        # stdout に有効な JSON を混ぜて returncode チェック自体の判別力を担保する
        # （理由は一覧側の同名テストのコメント参照）
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stdout=CLI_DELETE_JSON, stderr="guard tripped"),
            ),
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        assert resp.status_code >= 400
