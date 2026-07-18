"""DB モード（strategies.use_db: true）での実行系・書き込み系エンドポイントのテスト（vis#300）。

`StrategiesRepository` / `build_override_file` はストレージ非依存の実装で、
リポジトリ層には両モードのテストがあるが、次の統合点は JSON モードのテスト
（`client_with_strategies`）しか通っていなかった:

- `raw_definition` が strategies.db の `definition_json` 由来のときの
  `build_override_file` → `--strategy-file` 実行（POST /api/jobs の parameters）
- `forge strategy save --force` 委譲（POST /api/strategies/{id}/parameters）

網羅は目的ではなく、DB モード分岐が実際に踏まれることの確認（happy path 各 1）。
"""

from __future__ import annotations

import pathlib
import stat
import textwrap
import time
from collections.abc import Iterator
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.jobs import JobManager
from tests.factories import build_strategies_db

_STRATEGY_ID = "ema_cross_aapl"


def _build_db_mode_forge_dir(tmp_path: pathlib.Path) -> ForgeConfig:
    """strategies.db + use_db: true の forge.yaml を持つ forge_dir を作る。"""
    build_strategies_db(
        tmp_path / "data" / "strategies" / "strategies.db",
        strategy_id=_STRATEGY_ID,
        name="EMA クロス AAPL",
    )
    (tmp_path / "forge.yaml").write_text(
        textwrap.dedent(
            """
            report:
              output_path: ./data/results
              db_filename: backtest_results.db
            strategies:
              path: ./data/strategies
              use_db: true
              db_filename: strategies.db
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    return ForgeConfig.from_forge_dir(tmp_path)


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    stub = tmp_path / "forge-stub.sh"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


@pytest.fixture()
def db_mode_jobs_client(tmp_path: pathlib.Path) -> Iterator[TestClient]:
    """DB モード + スタブ forge（argv をログへ echo）のジョブ API クライアント。"""
    config = _build_db_mode_forge_dir(tmp_path)
    stub = _make_stub(
        tmp_path,
        'echo "argv: $@" >&2\n'
        'printf \'{"run_id": "run-dbmode-1"}\'\n',
    )
    app = create_app(config=config)
    app.state.job_manager = JobManager(
        forge_config=config,
        forge_resolver=lambda: stub,
        concurrency=1,
        timeout_sec=30,
    )
    with TestClient(app) as client:
        yield client


def _wait_status(
    client: TestClient, job_id: str, statuses: set[str], timeout: float = 10.0
) -> dict:
    deadline = time.monotonic() + timeout
    body: dict = {}
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in statuses:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} が {statuses} になりませんでした: {body}")


class TestDbModeTuningJob:
    def test_parameters_job_runs_with_strategy_file(
        self, db_mode_jobs_client: TestClient, tmp_path: pathlib.Path
    ) -> None:
        """DB モードでも parameters 指定のチューニング実行が --strategy-file で走る。

        WHY: raw_definition が strategies.db の definition_json 由来のパスは
        JSON モードのテストでは踏まれない（vis#300）。
        """
        resp = db_mode_jobs_client.post(
            "/api/jobs",
            json={
                "kind": "backtest",
                "strategy_id": _STRATEGY_ID,
                "symbol": "AAPL",
                "parameters": {"fast": 20},
            },
        )
        assert resp.status_code == 202, resp.text

        done = _wait_status(
            db_mode_jobs_client, resp.json()["job_id"], {"succeeded", "failed"}
        )
        assert done["status"] == "succeeded"
        # スタブが echo した argv に --strategy-file が含まれる（--strategy ではない）
        assert "--strategy-file" in done["log_tail"]
        assert "--strategy " not in done["log_tail"]


class TestDbModeSaveParameters:
    def test_save_parameters_delegates_to_forge_strategy_save(
        self, tmp_path: pathlib.Path
    ) -> None:
        """DB モードでもパラメータ保存が forge strategy save --force へ委譲される。"""
        config = _build_db_mode_forge_dir(tmp_path)
        client = TestClient(create_app(config=config))

        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch(
                "subprocess.run",
                return_value=mock.Mock(returncode=0, stdout="保存しました", stderr=""),
            ) as run_mock,
        ):
            resp = client.post(
                f"/api/strategies/{_STRATEGY_ID}/parameters",
                json={"parameters": {"fast": 99}},
            )

        assert resp.status_code == 200, resp.text
        # DB の definition_json（{"fast": 12, "slow": 26}）に対する部分更新:
        # 指定キーだけ差し替わり、未指定キーは維持される
        assert resp.json()["parameters"] == {"fast": 99, "slow": 26}

        args, kwargs = run_mock.call_args
        cmd = args[0]
        assert cmd[1:3] == ["strategy", "save"]
        assert cmd[-1] == "--force"
        # 一時ファイルは DB 由来の definition_json ベース + parameters 差し替えで
        # 生成される（subprocess 実行時点の内容は mock では読めないため、
        # ここでは委譲コマンドの形と後始末のみ固定する）
        tmp_file = pathlib.Path(cmd[3])
        assert not tmp_file.exists()
