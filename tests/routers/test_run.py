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

    def test_run_subprocess_contract_prevents_hang_and_option_injection(
        self, client_with_db: TestClient
    ) -> None:
        """subprocess 呼び出しの安全契約（レビュー第2ラウンド対応）。

        - stdin=DEVNULL: EULA 未同意の初回実行では forge が Confirm.ask() で
          stdin 入力を待つ（FORGE_ACCEPT_EULA のみが非対話同意の手段で、
          FORGE_NONINTERACTIVE では防げない）。stdin を閉じておくことで
          タイムアウトまでハングせず即座に失敗させる。
        - ``--`` 終端マーカー: symbol が「-」始まりの文字列でもオプションと
          誤解釈されず positional として渡る。
        """
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
        args, kwargs = run_mock.call_args
        assert kwargs["stdin"] == subprocess.DEVNULL
        # symbol は必ず -- の直後（末尾）に置く
        assert args[0][-2:] == ["--", "AAPL"]

    @pytest.mark.parametrize(
        "payload",
        [
            {"strategy_id": "", "symbol": "AAPL"},
            {"strategy_id": "test_strategy", "symbol": ""},
        ],
    )
    def test_run_rejects_empty_fields_with_422(
        self, client_with_db: TestClient, payload: dict[str, str]
    ) -> None:
        """空文字の strategy_id / symbol は subprocess に渡さず境界で 422 にする"""
        resp = client_with_db.post("/api/run", json=payload)
        assert resp.status_code == 422

    def test_run_failure_detail_is_truncated_to_tail(
        self, client_with_db: TestClient
    ) -> None:
        """失敗時の detail も成功時 log_tail と同じ末尾50行に丸める。

        forge の長大なトレースバックで HTTP レスポンスが無制限に
        膨らまないようにする（成功/失敗でログの扱いを対称にする）。
        """
        stderr_lines = [f"line-{i}" for i in range(60)]
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stderr="\n".join(stderr_lines)),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail.startswith("line-10")
        assert detail.endswith("line-59")
        assert "line-9\n" not in detail

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

    def test_run_parses_json_even_with_leading_warning_lines(
        self, client_with_db: TestClient
    ) -> None:
        """JSON の前に警告行が混ざっても run_id を取得できる。

        forge が deprecation warning 等を stdout に出すバージョンでも
        レース解消（JSON からの直接取得）が無効化されないようにする。
        """
        stdout = (
            "Warning: something is deprecated\n"
            + json.dumps({"run_id": "run-from-json"})
        )
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=stdout)),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert resp.json()["run_id"] == "run-from-json"

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
        # 全 60 行のうち末尾 50 行（line-10〜line-59）に丸める。
        # 先頭は line-10 になり、切り落とし境界の line-9 は含まれない。
        assert log_tail.startswith("line-10\n")
        assert log_tail.endswith("line-59")
        assert "line-9\n" not in log_tail

    def test_run_log_tail_masks_home_directory(
        self, client_with_db: TestClient
    ) -> None:
        """log_tail 内のホームディレクトリ絶対パスは ~ にマスクする。

        forge の stderr にはデータ保存先などの絶対パスが含まれうる。
        非 localhost バインドで公開された場合にユーザー名等の実行環境情報が
        API 経由で漏れないよう、レスポンスに載せる前にマスクする。
        """
        stdout = json.dumps({"run_id": "run-from-json"})
        stderr = "saved to /home/testuser/data/AAPL_1d.parquet"
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=stdout, stderr=stderr)
            ),
            mock.patch(
                "pathlib.Path.home",
                return_value=__import__("pathlib").Path("/home/testuser"),
            ),
        ):
            resp = client_with_db.post(
                "/api/run",
                json={"strategy_id": "test_strategy", "symbol": "AAPL"},
            )
        assert resp.status_code == 200
        assert resp.json()["log_tail"] == "saved to ~/data/AAPL_1d.parquet"

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

    @pytest.mark.parametrize("raw", ["abc", "0", "-5"])
    def test_run_invalid_timeout_env_falls_back_to_default(
        self, client_with_db: TestClient, monkeypatch: pytest.MonkeyPatch, raw: str
    ) -> None:
        """ALPHA_VIS_RUN_TIMEOUT が数値でない・0 以下の場合はデフォルト 600 秒で続行する。

        0 は subprocess.run(timeout=0) の即時 TimeoutExpired、負値は ValueError に
        なるため、下限もここで弾く。
        """
        monkeypatch.setenv("ALPHA_VIS_RUN_TIMEOUT", raw)
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
