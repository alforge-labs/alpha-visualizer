"""JobManager（非同期ジョブ基盤）のテスト。

実プロセスの代わりに、forge と同じ入出力契約（stderr=進捗ログ・stdout=JSON・
exit code）を持つスタブシェルスクリプトを起動して検証する。
"""

from __future__ import annotations

import pathlib
import stat

import pytest

from alpha_visualizer.errors import TooManyJobsError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.jobs import JobManager, build_argv

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _make_stub(tmp_path: pathlib.Path, body: str) -> str:
    """forge の入出力契約を模したスタブ実行ファイルを作る。"""
    stub = tmp_path / "forge-stub.sh"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return str(stub)


def _manager(
    tmp_path: pathlib.Path,
    stub: str | None,
    *,
    concurrency: int = 1,
    timeout_sec: int = 10,
    max_active: int | None = None,
) -> JobManager:
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    return JobManager(
        forge_config=cfg,
        forge_resolver=lambda: stub,
        concurrency=concurrency,
        timeout_sec=timeout_sec,
        max_active=max_active,
    )


class TestBuildArgv:
    """kind ごとの CLI 契約。symbol は常に -- の後ろ（オプション誤解釈防止）。"""

    def test_backtest(self) -> None:
        argv = build_argv("/bin/forge", "backtest", "s1", "AAPL", None, None)
        assert argv == [
            "/bin/forge", "backtest", "run", "--strategy", "s1", "--json", "--", "AAPL",
        ]

    def test_optimize_includes_save_and_trials(self) -> None:
        # --save が無いと all_trials が DB に載らず Optimize タブに反映されない
        argv = build_argv("/bin/forge", "optimize", "s1", "AAPL", 30, None)
        assert argv == [
            "/bin/forge", "optimize", "run", "--strategy", "s1",
            "--save", "--json", "--trials", "30", "--", "AAPL",
        ]

    def test_optimize_without_trials_uses_forge_default(self) -> None:
        argv = build_argv("/bin/forge", "optimize", "s1", "AAPL", None, None)
        assert "--trials" not in argv

    def test_wft_includes_windows(self) -> None:
        argv = build_argv("/bin/forge", "wft", "s1", "AAPL", None, 7)
        assert argv == [
            "/bin/forge", "optimize", "walk-forward", "--strategy", "s1",
            "--json", "--windows", "7", "--", "AAPL",
        ]


class TestJobLifecycle:
    async def test_backtest_job_succeeds_with_compact_result(
        self, tmp_path: pathlib.Path
    ) -> None:
        """成功ジョブ: ログが流れ、stdout JSON はスカラーのみの要約に圧縮される。

        equity_curve / trades のような巨大配列をジョブ結果に保持すると
        メモリと API レスポンスが際限なく膨らむため、要約から落とす。
        """
        stub = _make_stub(
            tmp_path,
            'echo "progress 1" >&2\n'
            'echo "progress 2" >&2\n'
            'printf \'{"run_id": "run-stub-1", "pre_filter_pass": true,'
            ' "metrics": {"sharpe_ratio": 1.5}, "equity_curve": [1, 2, 3]}\'\n',
        )
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.returncode == 0
        assert record.result is not None
        assert record.result["run_id"] == "run-stub-1"
        assert record.result["pre_filter_pass"] is True
        assert record.result["metrics"] == {"sharpe_ratio": 1.5}
        assert "equity_curve" not in record.result
        _, lines = manager.log_since(job.job_id, 0)
        assert "progress 1" in lines
        assert "progress 2" in lines

    async def test_failed_job_captures_error(self, tmp_path: pathlib.Path) -> None:
        stub = _make_stub(
            tmp_path,
            'echo "Error: strategy not found" >&2\n'
            "exit 3\n",
        )
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "failed"
        assert record.returncode == 3
        assert record.error is not None
        assert "strategy not found" in record.error

    async def test_log_masks_home_directory(self, tmp_path: pathlib.Path) -> None:
        """ログ行のホームパスは ~ にマスクされる（/api/run と同じ漏洩対策）"""
        stub = _make_stub(tmp_path, 'echo "saved to $HOME/data/x.parquet" >&2\n')
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        await manager.wait_terminal(job.job_id, timeout=10)
        _, lines = manager.log_since(job.job_id, 0)
        assert any(line == "saved to ~/data/x.parquet" for line in lines)

    async def test_cancel_running_job(self, tmp_path: pathlib.Path) -> None:
        stub = _make_stub(tmp_path, 'echo "started" >&2\nsleep 30\n')
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        # running になるまで待ってからキャンセルする
        await manager.wait_status(job.job_id, "running", timeout=10)
        await manager.cancel(job.job_id)
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "cancelled"

    async def test_cancel_queued_job(self, tmp_path: pathlib.Path) -> None:
        """実行スロット待ちのジョブはプロセス起動前にキャンセルできる"""
        stub = _make_stub(tmp_path, "sleep 30\n")
        manager = _manager(tmp_path, stub, concurrency=1)
        first = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        await manager.wait_status(first.job_id, "running", timeout=10)
        second = await manager.create(kind="backtest", strategy_id="s2", symbol="MSFT")
        assert manager.get(second.job_id).status == "queued"

        await manager.cancel(second.job_id)
        record = await manager.wait_terminal(second.job_id, timeout=10)
        assert record.status == "cancelled"
        # 後始末: 実行中の 1 本目も止める
        await manager.cancel(first.job_id)
        await manager.wait_terminal(first.job_id, timeout=10)

    async def test_concurrency_limits_parallel_runs(
        self, tmp_path: pathlib.Path
    ) -> None:
        stub = _make_stub(tmp_path, "sleep 30\n")
        manager = _manager(tmp_path, stub, concurrency=1)
        first = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        second = await manager.create(kind="backtest", strategy_id="s2", symbol="MSFT")
        await manager.wait_status(first.job_id, "running", timeout=10)

        assert manager.get(second.job_id).status == "queued"

        await manager.cancel(first.job_id)
        await manager.wait_terminal(first.job_id, timeout=10)
        # 1 本目が終わればスロットが空き、2 本目が動き出す
        await manager.wait_status(second.job_id, "running", timeout=10)
        await manager.cancel(second.job_id)
        await manager.wait_terminal(second.job_id, timeout=10)

    async def test_timeout_kills_job(self, tmp_path: pathlib.Path) -> None:
        stub = _make_stub(tmp_path, "sleep 30\n")
        manager = _manager(tmp_path, stub, timeout_sec=1)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=15)
        assert record.status == "failed"
        assert record.error is not None
        assert "1" in record.error  # タイムアウト秒数を含む

    async def test_forge_missing_fails_with_funnel_message(
        self, tmp_path: pathlib.Path
    ) -> None:
        """forge 未導入時はジョブが failed になり導線 URL を含める"""
        manager = _manager(tmp_path, None)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None
        assert record.error.rsplit(" ", 1)[-1] == "https://alforgelabs.com"

    async def test_create_rejects_when_active_limit_reached(
        self, tmp_path: pathlib.Path
    ) -> None:
        """非 terminal ジョブが上限に達したら 429 相当のエラーで拒否する。

        流量ガードが無いとジョブ大量作成でセマフォ待ちタスクが際限なく
        積み上がる（SECURITY.md の非 localhost バインド注意との整合）。
        """
        stub = _make_stub(tmp_path, "sleep 30\n")
        manager = _manager(tmp_path, stub, max_active=2)
        first = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        second = await manager.create(kind="backtest", strategy_id="s2", symbol="MSFT")

        with pytest.raises(TooManyJobsError):
            await manager.create(kind="backtest", strategy_id="s3", symbol="GOOG")

        # terminal になれば枠が空き、再び作成できる
        await manager.cancel(first.job_id)
        await manager.wait_terminal(first.job_id, timeout=10)
        third = await manager.create(kind="backtest", strategy_id="s3", symbol="GOOG")
        assert manager.get(third.job_id) is not None
        # 後始末
        for job_id in (second.job_id, third.job_id):
            await manager.cancel(job_id)
            await manager.wait_terminal(job_id, timeout=10)

    async def test_list_returns_newest_first(self, tmp_path: pathlib.Path) -> None:
        stub = _make_stub(tmp_path, "exit 0\n")
        manager = _manager(tmp_path, stub)
        first = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        second = await manager.create(kind="optimize", strategy_id="s2", symbol="MSFT")
        await manager.wait_terminal(first.job_id, timeout=10)
        await manager.wait_terminal(second.job_id, timeout=10)

        ids = [r.job_id for r in manager.list()]
        assert ids.index(second.job_id) < ids.index(first.job_id)
