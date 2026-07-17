"""run ルーターのテスト（forge コマンド呼び出し）。"""

from __future__ import annotations

import json
import subprocess
from unittest import mock

import pytest
from fastapi.testclient import TestClient


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


class TestRunRouter:
    def test_run_success_takes_run_id_from_json_stdout(
        self, client_with_db: TestClient
    ) -> None:
        """--json の stdout に run_id があればそれを使う（DB の最新拾いはしない）。

        DB フィクスチャには run-abc123 が入っているが、forge #1232 以降は
        stdout JSON の run_id が正であり、並行実行時のレース（別ランの
        run_id を返す）を避けられる。
        """
        stdout = json.dumps({"run_id": "run-from-json", "result_id": "r1"})
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=stdout)
            ) as run_mock,
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["run_id"] == "run-from-json"
        assert body["status"] == "ok"

        # CLI 呼び出しの契約: --json 付き・timeout 指定・非対話モード
        args, kwargs = run_mock.call_args
        assert "--json" in args[0]
        assert kwargs["timeout"] == 600
        assert kwargs["env"]["FORGE_NONINTERACTIVE"] == "1"

    def test_run_falls_back_to_db_when_stdout_not_json(
        self, client_with_db: TestClient
    ) -> None:
        """stdout が JSON でない旧 forge では従来どおり DB の最新 run_id を返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout="Backtest complete.")
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert resp.json()["run_id"] == "run-abc123"

    def test_run_falls_back_to_db_when_json_lacks_run_id(
        self, client_with_db: TestClient
    ) -> None:
        """JSON だが run_id が無い（古い --json 形式）場合も DB フォールバック"""
        stdout = json.dumps({"metrics": {"sharpe_ratio": 1.2}})
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=stdout)),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert resp.json()["run_id"] == "run-abc123"

    def test_run_returns_stderr_tail_as_log_tail(
        self, client_with_db: TestClient
    ) -> None:
        """成功時、stderr の末尾を log_tail としてレスポンスに含める"""
        stdout = json.dumps({"run_id": "run-from-json"})
        stderr_lines = [f"line-{i}" for i in range(60)]
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(stdout=stdout, stderr="\n".join(stderr_lines)),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        log_tail = resp.json()["log_tail"]
        # 末尾 50 行に丸める（先頭側が落ちる）
        assert "line-59" in log_tail
        assert "line-10" in log_tail
        assert "line-9\n" not in log_tail
        assert not log_tail.startswith("line-9")

    def test_run_log_tail_is_none_when_stderr_empty(
        self, client_with_db: TestClient
    ) -> None:
        """stderr が空なら log_tail は null"""
        stdout = json.dumps({"run_id": "run-from-json"})
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=stdout)),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert resp.json()["log_tail"] is None

    def test_run_timeout_returns_500(self, client_with_db: TestClient) -> None:
        """forge がタイムアウトしたとき 500 とタイムアウト秒数入りメッセージを返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                side_effect=subprocess.TimeoutExpired(cmd=["forge"], timeout=600),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 500
        assert "600" in resp.json()["detail"]

    def test_run_timeout_configurable_via_env(
        self, client_with_db: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """ALPHA_VIS_RUN_TIMEOUT で subprocess の timeout を上書きできる"""
        monkeypatch.setenv("ALPHA_VIS_RUN_TIMEOUT", "30")
        stdout = json.dumps({"run_id": "run-from-json"})
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=stdout)
            ) as run_mock,
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert run_mock.call_args.kwargs["timeout"] == 30

    def test_run_invalid_timeout_env_falls_back_to_default(
        self, client_with_db: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """ALPHA_VIS_RUN_TIMEOUT が数値でない場合はデフォルト 600 秒で続行する"""
        monkeypatch.setenv("ALPHA_VIS_RUN_TIMEOUT", "abc")
        stdout = json.dumps({"run_id": "run-from-json"})
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=stdout)
            ) as run_mock,
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert run_mock.call_args.kwargs["timeout"] == 600

    def test_run_accepts_legacy_timeframe_field(
        self, client_with_db: TestClient
    ) -> None:
        """旧フロントが送る timeframe フィールドは無視して受理する（互換性）。

        timeframe は戦略定義由来で CLI に渡すフラグが存在しないため
        API から除去したが、古いフロントのリクエストは壊さない。
        """
        stdout = json.dumps({"run_id": "run-from-json"})
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=stdout)),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={
                    "strategy_id": "test_strategy",
                    "symbol": "AAPL",
                    "timeframe": "1d",
                },
            )
        assert resp.status_code == 200

    def test_run_forge_not_found(self, client_with_db: TestClient) -> None:
        """forge コマンドが PATH にないとき 500 を返す。

        forge 未導入ユーザーが Run を押した瞬間は AlphaForge 導入意欲が最も高い
        接点なので、エラーメッセージにインストール先（alforgelabs.com）を必ず
        含める（OSS → フルエンジンの送客導線）。
        """
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert "forge" in detail.lower()
        # CodeQL py/incomplete-url-substring-sanitization は substring/endswith
        # 判定を誤検知するため、末尾トークンの等価比較で導線 URL を検証する
        assert detail.rsplit(" ", 1)[-1] == "https://alforgelabs.com"

    def test_run_subprocess_failure(self, client_with_db: TestClient) -> None:
        """forge コマンドが非ゼロで終了したとき 500 を返す"""
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stderr="Error: strategy not found"),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 500
        assert "Error: strategy not found" in resp.json()["detail"]
