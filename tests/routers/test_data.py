"""data ルーターのテスト（forge CLI 委譲・issue #484 / #485）。

`GET /api/data` は `alpha-forge data list --json` に委譲し、visualizer 側で
parquet の mtime から鮮度（updated_at / stale）を付加する。parquet の中身は
読まない（single-writer 原則・フォーマット非依存の維持）。

`POST /api/data/jobs`（issue #485）は data fetch / update を既存ジョブ基盤
（JobManager + SSE）で非同期実行する。テストは test_jobs.py と同じく forge の
入出力契約を模したスタブ実行ファイルを注入する。
"""

from __future__ import annotations

import json
import os
import pathlib
import stat
import time
from collections.abc import Iterator
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.jobs import JobManager


def _dataset(symbol: str, file_path: str, **overrides: Any) -> dict[str, Any]:
    """CLI の `datasets[]` 1 要素（実データの形をそのまま縮めたもの）。"""
    base: dict[str, Any] = {
        "symbol": symbol,
        "interval": "1d",
        "start": "2021-03-23",
        "end": "2026-07-24",
        "rows": 1306,
        "file_path": file_path,
        "size_bytes": 68279,
    }
    return {**base, **overrides}


def _cli_json(datasets: list[dict[str, Any]]) -> str:
    return json.dumps({"datasets": datasets, "count": len(datasets)})


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


def _touch_parquet(
    tmp_path: pathlib.Path, name: str, *, age_hours: float = 0.0
) -> pathlib.Path:
    """mtime を指定時間だけ過去に倒したダミー parquet を作る。

    鮮度判定はファイルの mtime だけを見る（中身は読まない）ため、
    ダミーバイトで十分。
    """
    path = tmp_path / name
    path.write_bytes(b"parquet")
    if age_hours:
        t = time.time() - age_hours * 3600
        os.utime(path, (t, t))
    return path


class TestDataList:
    def test_CLI_の_json_を鮮度付きで返す(
        self, client: TestClient, tmp_path: pathlib.Path
    ) -> None:
        """TTL 24h を境に stale が付き、ローカル絶対パスは露出しないこと。"""
        fresh = _touch_parquet(tmp_path, "SPY_1d.parquet")
        old = _touch_parquet(tmp_path, "QQQ_1d.parquet", age_hours=25)
        cli_json = _cli_json(
            [_dataset("SPY", str(fresh)), _dataset("QQQ", str(old))]
        )
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=cli_json)
            ) as run_mock,
        ):
            resp = client.get("/api/data")

        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 2
        by_symbol = {d["symbol"]: d for d in body["datasets"]}
        assert by_symbol["SPY"]["stale"] is False
        assert by_symbol["SPY"]["updated_at"] is not None
        assert by_symbol["QQQ"]["stale"] is True
        assert by_symbol["SPY"]["rows"] == 1306
        assert by_symbol["SPY"]["start"] == "2021-03-23"
        assert by_symbol["SPY"]["end"] == "2026-07-24"
        assert by_symbol["SPY"]["size_bytes"] == 68279
        # ローカルの絶対パス（ユーザー名等の実行環境情報）を API に露出しない
        assert "file_path" not in by_symbol["SPY"]

        # 読み取り専用コマンドへの完全一致（余計なフラグの混入を許さない）
        argv = run_mock.call_args[0][0]
        assert argv[1:] == ["data", "list", "--json"]

    def test_データ0件なら空配列を返す(self, client: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=_cli_json([]))),
        ):
            resp = client.get("/api/data")

        assert resp.status_code == 200
        assert resp.json()["datasets"] == []
        assert resp.json()["count"] == 0

    def test_parquet不在なら鮮度を不明として返す(
        self, client: TestClient, tmp_path: pathlib.Path
    ) -> None:
        """CLI 応答とファイル実体がずれても 500 にせず「鮮度不明」で返すこと。

        一覧の一部が消えているだけで画面全体が壊れてはいけない。
        """
        missing = tmp_path / "GONE_1d.parquet"  # 作らない
        cli_json = _cli_json([_dataset("GONE", str(missing))])
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=cli_json)),
        ):
            resp = client.get("/api/data")

        assert resp.status_code == 200
        item = resp.json()["datasets"][0]
        assert item["symbol"] == "GONE"
        assert item["updated_at"] is None
        assert item["stale"] is None

    def test_forge未導入なら503と機械可読codeを返す(self, client: TestClient) -> None:
        """forge 未導入は想定内の状態であり、サーバー障害（500）と区別できる
        503 + 機械可読 code で返すこと（issue #358 の規約）。
        """
        with mock.patch("shutil.which", return_value=None):
            resp = client.get("/api/data")

        assert resp.status_code == 503
        body = resp.json()
        assert body["code"] == "forge_cli_not_found"
        # CodeQL py/incomplete-url-substring-sanitization 対策: 部分一致でなく
        # 末尾トークンの等価比較で funnel URL を検証する（他ルーターと同規約）
        assert body["detail"].rsplit(" ", 1)[-1] == "https://alforgelabs.com"

    def test_forgeが非ゼロ終了したらエラーにする(self, client: TestClient) -> None:
        # stdout に有効な JSON を混ぜて returncode チェック自体の判別力を担保する
        # （stdout が空だと JSON パース失敗経由でも偶然 4xx/5xx になり、
        # returncode チェックが抜けていても検出できないため）
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stdout=_cli_json([]), stderr="boom"),
            ),
        ):
            resp = client.get("/api/data")

        assert resp.status_code >= 400

    def test_EULA未同意の場合は同意手順を案内する(self, client: TestClient) -> None:
        """visualizer は stdin=DEVNULL で forge を起動するため同意プロンプトに
        応答できず、Click が "Aborted!" だけを残して落ちる。次の一歩
        （ターミナルで同意する手順）まで示すメッセージに変換されること。
        """
        eula_stdout = (
            "╭── AlphaForge エンドユーザー使用許諾契約 (EULA) — 初回起動時の確認 ──╮\n"
            "│ 本ソフトウェアの利用には EULA への同意が必要です。                  │\n"
            "╰────────────────────────────────────────────────────────────────────╯\n"
            "EULA に同意しますか? [y/n] (n): "
        )
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=1, stdout=eula_stdout, stderr="\nAborted!"),
            ),
        ):
            resp = client.get("/api/data")

        assert resp.status_code >= 400
        detail = resp.json()["detail"]
        assert "Aborted!" not in detail
        assert "EULA" in detail
        assert "alpha-forge system doctor" in detail

    def test_forgeにサブコマンドが無い場合はアップデートを促すメッセージを返す(
        self, client: TestClient
    ) -> None:
        """forge は導入済みだがバージョンが古く `data list` を持たないケース。"""
        click_stderr = (
            "Usage: forge data [OPTIONS] COMMAND [ARGS]...\n"
            "Try 'forge data -h' for help.\n\n"
            "Error: No such command 'list'."
        )
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run",
                return_value=_proc(returncode=2, stdout="", stderr=click_stderr),
            ),
        ):
            resp = client.get("/api/data")

        assert resp.status_code >= 400
        detail = resp.json()["detail"]
        # 生の Click エラー文言をそのまま出していない
        assert "No such command" not in detail
        assert "新しいバージョンへ更新" in detail
        assert detail.rsplit(" ", 1)[-1] == "https://alforgelabs.com"

    def test_stdoutが壊れていたらエラーにする(self, client: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout="not json at all")),
        ):
            resp = client.get("/api/data")

        assert resp.status_code >= 400


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    """forge の入出力契約を模したスタブ実行ファイルを作る（test_jobs.py と同型）。"""
    stub = tmp_path / "forge-stub.sh"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


@pytest.fixture()
def data_jobs_client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    """スタブ forge を注入したデータジョブ用クライアント。

    スタブは受け取った argv を stderr に echo する（ジョブログから CLI 契約を
    検証するため）。JobManager の resolver 注入に加えて、ルーターの fail-fast
    が呼ぶ ``routers.data.resolve_forge_exe`` も patch する — こちらは実 PATH を
    見るため、CLI の無い CI では素通しすると 503 になり結果が実行マシン依存に
    なる（agent ルーターのテストと同じ罠）。
    """
    stub = _make_stub(
        tmp_path,
        'echo "ARGS: $@" >&2\nprintf \'{"updated": 1}\'\n',
    )
    app = create_app(forge_dir=tmp_path)
    app.state.job_manager = JobManager(
        forge_config=ForgeConfig.from_forge_dir(tmp_path),
        forge_resolver=lambda: stub,
        concurrency=1,
        timeout_sec=30,
    )
    with (
        mock.patch(
            "alpha_visualizer.routers.data.resolve_forge_exe", return_value=stub
        ),
        TestClient(app) as client,
    ):
        yield client


def _wait_status(
    client: TestClient, job_id: str, statuses: set[str], timeout: float = 10.0
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    body: dict[str, Any] = {}
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in statuses:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} が {statuses} になりませんでした: {body}")


class TestDataJobs:
    """POST /api/data/jobs（issue #485）。"""

    def test_fetchジョブを起動して完了する(self, data_jobs_client: TestClient) -> None:
        resp = data_jobs_client.post(
            "/api/data/jobs",
            json={"action": "fetch", "symbol": "CL=F", "period": "5y", "interval": "1d"},
        )
        assert resp.status_code == 202
        body = resp.json()
        assert body["kind"] == "data_fetch"
        assert body["symbol"] == "CL=F"

        done = _wait_status(data_jobs_client, body["job_id"], {"succeeded", "failed"})
        assert done["status"] == "succeeded"
        # CLI 契約: data fetch --period/--interval、symbol は -- の後ろ
        assert "ARGS: data fetch --period 5y --interval 1d -- CL=F" in done["log_tail"]

    def test_fetchはperiodとinterval未指定ならforge既定に委ねる(
        self, data_jobs_client: TestClient
    ) -> None:
        resp = data_jobs_client.post(
            "/api/data/jobs", json={"action": "fetch", "symbol": "SPY"}
        )
        assert resp.status_code == 202
        done = _wait_status(data_jobs_client, resp.json()["job_id"], {"succeeded", "failed"})
        assert "ARGS: data fetch -- SPY" in done["log_tail"]

    def test_updateジョブを起動して完了する(self, data_jobs_client: TestClient) -> None:
        resp = data_jobs_client.post("/api/data/jobs", json={"action": "update"})
        assert resp.status_code == 202
        body = resp.json()
        assert body["kind"] == "data_update"

        done = _wait_status(data_jobs_client, body["job_id"], {"succeeded", "failed"})
        assert done["status"] == "succeeded"
        assert "ARGS: data update --json" in done["log_tail"]

    @pytest.mark.parametrize(
        "payload",
        [
            # fetch は symbol 必須
            {"action": "fetch"},
            {"action": "fetch", "symbol": ""},
            # forge argv への素通しを境界で塞ぐ（オプション注入・空白）
            {"action": "fetch", "symbol": "SPY", "period": "--force"},
            {"action": "fetch", "symbol": "SPY", "interval": "1d; rm"},
            {"action": "fetch", "symbol": "SP Y"},
            {"action": "invalid"},
        ],
    )
    def test_不正リクエストは422(
        self, data_jobs_client: TestClient, payload: dict[str, Any]
    ) -> None:
        resp = data_jobs_client.post("/api/data/jobs", json=payload)
        assert resp.status_code == 422

    def test_forge未導入なら503と機械可読codeを返す(
        self, data_jobs_client: TestClient
    ) -> None:
        """ジョブを積んでから失敗させず、起動前に fail-fast する（agent と同じ）。"""
        with mock.patch(
            "alpha_visualizer.routers.data.resolve_forge_exe", return_value=None
        ):
            resp = data_jobs_client.post(
                "/api/data/jobs", json={"action": "fetch", "symbol": "SPY"}
            )
        assert resp.status_code == 503
        assert resp.json()["code"] == "forge_cli_not_found"

    def test_非loopback公開中は403で拒否する(self, tmp_path: pathlib.Path) -> None:
        """データ取得は書き込み系のため localhost 限定（routers/agent.py の方針踏襲）。

        参照系の GET /api/data は非 loopback でも引き続き使える。
        """
        app = create_app(forge_dir=tmp_path, local_write_enabled=False)
        with TestClient(app) as client:
            resp = client.post(
                "/api/data/jobs", json={"action": "fetch", "symbol": "SPY"}
            )
            assert resp.status_code == 403
            assert resp.json()["code"] == "local_write_disabled"

            # 参照系はガードの対象外
            empty = json.dumps({"datasets": [], "count": 0})
            with (
                mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
                mock.patch("subprocess.run", return_value=_proc(stdout=empty)),
            ):
                assert client.get("/api/data").status_code == 200
