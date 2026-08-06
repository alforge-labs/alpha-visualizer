"""JobManager（非同期ジョブ基盤）のテスト。

実プロセスの代わりに、forge と同じ入出力契約（stderr=進捗ログ・stdout=JSON・
exit code）を持つスタブシェルスクリプトを起動して検証する。
"""

from __future__ import annotations

import pathlib
import stat
from typing import get_args

import pytest

from alpha_visualizer.errors import TooManyJobsError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services import jobs
from alpha_visualizer.services.forge_cli import FORGE_EULA_NOT_ACCEPTED_MESSAGE
from alpha_visualizer.services.jobs import (
    JobManager,
    build_argv,
    build_data_argv,
    build_live_refresh_argv,
)

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

    def test_wft_includes_save_and_windows(self) -> None:
        # --save が無いと WFT 結果が optimization_runs に保存されず
        # WFO タブに反映されない（forge#1293 で --save が追加された）
        argv = build_argv("/bin/forge", "wft", "s1", "AAPL", None, 7)
        assert argv == [
            "/bin/forge", "optimize", "walk-forward", "--strategy", "s1",
            "--save", "--json", "--windows", "7", "--", "AAPL",
        ]

    def test_backtest_with_strategy_file_replaces_strategy_option(self) -> None:
        """一時戦略ファイル指定時は --strategy-file を使う（チューニング実行 #293）"""
        argv = build_argv(
            "/bin/forge", "backtest", "s1", "AAPL", None, None,
            strategy_file="/tmp/tune-abc.json",
        )
        assert argv == [
            "/bin/forge", "backtest", "run",
            "--strategy-file", "/tmp/tune-abc.json", "--json", "--", "AAPL",
        ]
        assert "--strategy" not in argv


class TestBuildDataArgv:
    """データ系ジョブの CLI 契約（issue #485）。symbol は -- の後ろ。"""

    def test_fetch_はperiodとintervalを渡す(self) -> None:
        argv = build_data_argv("/bin/forge", "data_fetch", "CL=F", "5y", "1d")
        assert argv == [
            "/bin/forge", "data", "fetch", "--period", "5y", "--interval", "1d", "--", "CL=F",
        ]

    def test_fetch_は未指定オプションを省略してforge既定に委ねる(self) -> None:
        argv = build_data_argv("/bin/forge", "data_fetch", "SPY", None, None)
        assert argv == ["/bin/forge", "data", "fetch", "--", "SPY"]

    def test_update_は全銘柄差分更新でjsonを付ける(self) -> None:
        # data update は引数を取らない（保存済み全データの差分更新）
        argv = build_data_argv("/bin/forge", "data_update", "", None, None)
        assert argv == ["/bin/forge", "data", "update", "--json"]


class TestBuildLiveRefreshArgv:
    """live refresh ジョブの CLI 契約。"""

    def test_live_refresh_argv(self) -> None:
        """live refresh は引数無し・--json のみ（パラメータは forge.yaml が持つ）。"""
        argv = build_live_refresh_argv("/usr/local/bin/alpha-forge")
        assert argv == [
            "/usr/local/bin/alpha-forge", "live", "refresh", "--json",
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

    async def test_eula_not_accepted_job_reports_guidance(
        self, tmp_path: pathlib.Path
    ) -> None:
        """EULA 未同意で落ちたジョブも同意手順を案内する。

        ジョブ（optimize / WFT / backtest）も同期実行系と同じく
        stdin=DEVNULL で forge を起動するため同意プロンプトに応答できない。
        EULA プロンプトは stdout に出る一方、ジョブのログは stderr 由来なので、
        ログ末尾だけを error にする実装では "Aborted!" しか残らない。
        """
        stub = _make_stub(
            tmp_path,
            'echo "EULA に同意しますか? [y/n] (n): "\n'
            'echo "Aborted!" >&2\n'
            "exit 1\n",
        )
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "failed"
        assert record.error is not None
        assert "Aborted!" not in record.error
        assert "alpha-forge system doctor" in record.error

    async def test_log_masks_home_directory(self, tmp_path: pathlib.Path) -> None:
        """ログ行のホームパスは ~ にマスクされる（/api/run と同じ漏洩対策）"""
        stub = _make_stub(tmp_path, 'echo "saved to $HOME/data/x.parquet" >&2\n')
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        await manager.wait_terminal(job.job_id, timeout=10)
        _, lines = manager.log_since(job.job_id, 0)
        assert any(line == "saved to ~/data/x.parquet" for line in lines)

    async def test_result_masks_home_directory(self, tmp_path: pathlib.Path) -> None:
        """結果要約内の文字列値もホームパスを ~ にマスクする。

        optimize --save の stdout JSON には saved_path（絶対パス）が含まれる。
        SECURITY.md の「レスポンス中のホームパスはマスクされる」という約束を
        ログだけでなく結果要約にも適用する。
        """
        stub = _make_stub(
            tmp_path,
            'printf \'{"run_id": "r1", "saved_path": "%s/data/results/opt.json",'
            ' "report": {"path": "%s/report.json"}}\' "$HOME" "$HOME"\n',
        )
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="optimize", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["saved_path"] == "~/data/results/opt.json"
        assert record.result["report"]["path"] == "~/report.json"

    async def test_shutdown_terminates_running_jobs(
        self, tmp_path: pathlib.Path
    ) -> None:
        """shutdown() は実行中プロセスを止めてワーカーを回収する。

        start_new_session でセッション分離しているため、これが無いと
        サーバー終了（Ctrl+C）時に forge プロセスが孤児として残る。
        """
        stub = _make_stub(tmp_path, 'echo "started" >&2\nsleep 30\n')
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        await manager.wait_status(job.job_id, "running", timeout=10)

        await manager.shutdown()

        record = manager.get(job.job_id)
        assert record is not None
        assert record.status in {"cancelled", "failed"}

    async def test_huge_single_stderr_line_does_not_fail_job(
        self, tmp_path: pathlib.Path
    ) -> None:
        """改行なしの巨大 stderr 行（64KiB 超）でジョブが内部エラーにならない。

        StreamReader.readline() は limit 超過で ValueError を投げるため、
        行分割はチャンク読みで自前処理する必要がある。
        """
        stub = _make_stub(
            tmp_path,
            # 100KB の改行なし1行を stderr へ出してから正常終了する
            "head -c 102400 /dev/zero | tr '\\0' 'x' >&2\n"
            'printf \'{"run_id": "run-huge-1"}\'\n',
        )
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["run_id"] == "run-huge-1"
        _, lines = manager.log_since(job.job_id, 0)
        assert any("x" in line for line in lines)

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
        # CI（特に --cov 計測下・issue #393）ではプロセス終了〜スロット解放が
        # 10 秒を超えることがあるため、待ちには余裕を持たせる
        await manager.wait_terminal(first.job_id, timeout=30)
        # 1 本目が終わればスロットが空き、2 本目が動き出す
        await manager.wait_status(second.job_id, "running", timeout=30)
        await manager.cancel(second.job_id)
        await manager.wait_terminal(second.job_id, timeout=30)

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

    async def test_strategy_file_is_deleted_after_job_finishes(
        self, tmp_path: pathlib.Path
    ) -> None:
        """一時戦略ファイルはジョブ終了時に削除される（ゴミ掃除）"""
        stub = _make_stub(tmp_path, 'printf \'{"run_id": "r1"}\'\n')
        strategy_file = tmp_path / "tune-test.json"
        strategy_file.write_text("{}", encoding="utf-8")
        manager = _manager(tmp_path, stub)
        job = await manager.create(
            kind="backtest",
            strategy_id="s1",
            symbol="AAPL",
            strategy_file=str(strategy_file),
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "succeeded"
        assert not strategy_file.exists()

    async def test_list_returns_newest_first(self, tmp_path: pathlib.Path) -> None:
        stub = _make_stub(tmp_path, "exit 0\n")
        manager = _manager(tmp_path, stub)
        first = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        second = await manager.create(kind="optimize", strategy_id="s2", symbol="MSFT")
        await manager.wait_terminal(first.job_id, timeout=10)
        await manager.wait_terminal(second.job_id, timeout=10)

        ids = [r.job_id for r in manager.list()]
        assert ids.index(second.job_id) < ids.index(first.job_id)


def _agent_manager(
    tmp_path: pathlib.Path,
    agent_stub: str | None,
    *,
    timeout_sec: int = 10,
    max_turns: int | None = None,
) -> JobManager:
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    return JobManager(
        forge_config=cfg,
        forge_resolver=lambda: "/bin/true",  # agent ジョブでは使われない
        agent_resolver=lambda backend: agent_stub,
        concurrency=1,
        agent_timeout_sec=timeout_sec,
        agent_max_turns=max_turns,
    )


class TestAgentJob:
    """agent ジョブ種: stdout=JSONL イベント・整形ログ・結果抽出。"""

    CLAUDE_LINES = (
        'echo \'{"type": "system", "subtype": "init"}\'\n'
        "echo '{\"type\": \"assistant\", \"message\": {\"content\":"
        " [{\"type\": \"text\", \"text\": \"working\"}]}}'\n"
        "echo '{\"type\": \"result\", \"subtype\": \"success\", \"result\":"
        " \"{\\\"strategy_id\\\": \\\"new_s1\\\", \\\"run_id\\\": \\\"run-7\\\"}\"}'\n"
    )

    async def test_agent_job_formats_log_and_extracts_result(
        self, tmp_path: pathlib.Path
    ) -> None:
        stub = _make_stub(tmp_path, self.CLAUDE_LINES)
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="CL=F",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["strategy_id"] == "new_s1"
        assert record.result["run_id"] == "run-7"
        # 整形済みログが流れ、生 JSON はログに載らない
        _, lines = manager.log_since(job.job_id, 0)
        joined = "\n".join(lines)
        assert "working" in joined
        assert '"type": "system"' not in joined

    async def test_agent_job_backfills_strategy_id(
        self, tmp_path: pathlib.Path
    ) -> None:
        """WHY: 起動時は戦略が未存在のため strategy_id="" で作る。完了時に
        結果から書き戻さないと、ジョブ一覧でどの戦略を作ったのか辿れない。"""
        stub = _make_stub(tmp_path, self.CLAUDE_LINES)
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="CL=F",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.strategy_id == "new_s1"

    async def test_agent_job_runs_in_forge_dir(self, tmp_path: pathlib.Path) -> None:
        """WHY: cwd がワークスペースでないと、エージェントの相対パス操作が
        サーバー起動ディレクトリを汚す（権限モデルの前提が崩れる）。"""
        stub = _make_stub(tmp_path, "pwd > cwd-marker.txt\n")
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        await manager.wait_terminal(job.job_id, timeout=10)
        marker = tmp_path / "cwd-marker.txt"
        assert marker.exists()
        assert marker.read_text().strip() == str(tmp_path.resolve())

    async def test_agent_cli_not_found_fails_with_guidance(
        self, tmp_path: pathlib.Path
    ) -> None:
        manager = _agent_manager(tmp_path, None)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None and "claude" in record.error

    async def test_agent_login_failure_is_translated(
        self, tmp_path: pathlib.Path
    ) -> None:
        stub = _make_stub(
            tmp_path, 'echo "Invalid API key. Please run /login" >&2\nexit 1\n'
        )
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None
        assert "ログイン" in record.error or "log in" in record.error

    async def test_agent_result_survives_stdout_truncation(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: type=result イベントは stream-json の最後に来るため、
        STDOUT_MAX_BYTES 到達で stdout_buf が打ち切られると、結果だけを
        静かに失って succeeded になる（Fail Loud 違反）。行分割はバッファ上限と
        無関係に行われることを保証し、この劣化を防ぐ。"""
        monkeypatch.setattr(jobs, "STDOUT_MAX_BYTES", 1024)
        noise = "\n".join(
            "printf '{\"type\": \"assistant\", \"message\": {\"content\":"
            f' [{{"type": "text", "text": "noise-{i:03d}-'
            '0123456789012345678901234567890123456789"}]}}\\n\''
            for i in range(50)
        )
        body = (
            noise + "\n"
            "echo '{\"type\": \"result\", \"subtype\": \"success\", \"result\":"
            ' "{\\"strategy_id\\": \\"new_s1\\", \\"run_id\\": \\"run-7\\"}"}\'\n'
        )
        stub = _make_stub(tmp_path, body)
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="CL=F",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["strategy_id"] == "new_s1"
        assert record.result["run_id"] == "run-7"

    async def test_forge_jobs_are_unaffected(self, tmp_path: pathlib.Path) -> None:
        """回帰ガード: 既存 forge ジョブの stdout=結果 JSON 契約は不変。"""
        stub = _make_stub(tmp_path, 'printf \'{"run_id": "r1"}\'\n')
        manager = _manager(tmp_path, stub)
        job = await manager.create(kind="backtest", strategy_id="s1", symbol="AAPL")
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "succeeded"
        assert record.result == {"run_id": "r1"}

    async def test_agent_output_mentioning_eula_is_not_misdiagnosed(
        self, tmp_path: pathlib.Path
    ) -> None:
        """WHY: 実障害の再発防止。agent の stdout にはエージェント自身の発話と
        ツール出力が丸ごと入るため、本文の部分一致で forge の失敗を判定すると
        誤診断する。実際に、ワークスペース内の無関係なファイルを読んだだけの
        ジョブが「EULA 未同意」と案内され、真因（ターン上限到達）が隠された。
        """
        stub = _make_stub(
            tmp_path,
            "echo '{\"type\": \"assistant\", \"message\": {\"content\":"
            ' [{"type": "text", "text": "read docs about the EULA acceptance flow"}]}}\'\n'
            "exit 1\n",
        )
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None
        # EULA 未同意の案内へ変換されない
        assert record.error != FORGE_EULA_NOT_ACCEPTED_MESSAGE
        assert "同意していない" not in record.error
        # 代わりに生ログへフォールバックし、実際の出力が調査材料として残る
        assert "read docs about the EULA acceptance flow" in record.error

    async def test_agent_turn_limit_is_reported_with_next_step(
        self, tmp_path: pathlib.Path
    ) -> None:
        """WHY: ターン上限での打ち切りは「失敗」ではなく「途中で切れた」状態。
        原因（上限到達）と次の一歩（分割 / 上限引き上げ）が伝わらないと、
        利用者は成果物が中途半端な理由を知りようがない。"""
        stub = _make_stub(
            tmp_path,
            "echo '{\"type\": \"result\", \"subtype\": \"error_max_turns\","
            ' "is_error": true}\'\n'
            "exit 1\n",
        )
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p", max_turns=7,
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)
        assert record.status == "failed"
        assert record.error is not None
        # 指定した上限値そのものを含める（既定値を出すと調整の手がかりにならない）
        assert "7" in record.error
        assert "ターン上限" in record.error

    async def test_agent_max_turns_reaches_argv(self, tmp_path: pathlib.Path) -> None:
        """WHY: GUI から指定した上限が argv に届かなければ設定 UI は嘘になる。"""
        stub = _make_stub(tmp_path, 'printf "%s\\n" "$@" > argv.txt\n')
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p", max_turns=42,
        )
        await manager.wait_terminal(job.job_id, timeout=10)
        argv = (tmp_path / "argv.txt").read_text(encoding="utf-8").splitlines()
        assert argv[argv.index("--max-turns") + 1] == "42"

    async def test_agent_max_turns_falls_back_to_manager_default(
        self, tmp_path: pathlib.Path
    ) -> None:
        """WHY: 未指定時はサーバー既定（環境変数で調整可能）を使う。"""
        stub = _make_stub(tmp_path, 'printf "%s\\n" "$@" > argv.txt\n')
        manager = _agent_manager(tmp_path, stub, max_turns=123)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        await manager.wait_terminal(job.job_id, timeout=10)
        argv = (tmp_path / "argv.txt").read_text(encoding="utf-8").splitlines()
        assert argv[argv.index("--max-turns") + 1] == "123"

    async def test_agent_giant_stdout_line_does_not_break_later_events(
        self, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """WHY: 改行の来ない巨大な 1 行で stdout 行バッファが際限なく伸びる
        （stderr 側には STDERR_LINE_MAX の同種ガードがある）。上限で切り捨てた
        あと、後続の result イベントの解釈が壊れないことまで保証する。"""
        monkeypatch.setattr(jobs, "STDOUT_LINE_MAX", 1024)
        body = (
            # 改行を挟まない 5000 文字。上限（1024）を大きく超える
            "awk 'BEGIN{for(i=0;i<5000;i++)printf \"x\"}'\n"
            "echo ''\n"
            "echo '{\"type\": \"result\", \"subtype\": \"success\", \"result\":"
            " \"{\\\"strategy_id\\\": \\\"new_s1\\\"}\"}'\n"
        )
        stub = _make_stub(tmp_path, body)
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="",
            goal="g", backend="claude", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["strategy_id"] == "new_s1"
        # 巨大行は JSON ではないため、切り出された断片もログには載らない
        _, lines = manager.log_since(job.job_id, 0)
        assert "xxxx" not in "\n".join(lines)


class TestCodexAgentJob:
    """codex バックエンドの統合（argv・イベント整形・結果抽出）。

    WHY: 既存の agent 統合テストは claude 形式のみで、codex は単体テスト
    （argv 構築・イベント整形）しか通っていなかった。JobManager を経由した
    経路で初めて分かる齟齬（argv の受け渡し・cwd・結果抽出の接続）を押さえる。
    """

    CODEX_LINES = (
        # 完了前の部分イベント。ログにも最終結果にも出てはいけない
        "echo '{\"type\": \"item.started\", \"item\": {\"type\":"
        ' "agent_message", "text": "partial-should-not-appear"}}\'\n'
        "echo '{\"type\": \"item.completed\", \"item\": {\"type\":"
        ' "command_execution", "command": "alpha-forge backtest run"}}\'\n'
        "echo '{\"type\": \"item.completed\", \"item\": {\"type\":"
        ' "agent_message", "text":'
        " \"{\\\"strategy_id\\\": \\\"cx_s1\\\", \\\"run_id\\\": \\\"run-42\\\"}\"}}'\n"
    )

    async def test_codex_job_passes_sandbox_argv_and_extracts_result(
        self, tmp_path: pathlib.Path
    ) -> None:
        stub = _make_stub(
            tmp_path, 'printf "%s\\n" "$@" > argv.txt\n' + self.CODEX_LINES
        )
        manager = _agent_manager(tmp_path, stub)
        job = await manager.create(
            kind="agent", strategy_id="", symbol="CL=F",
            goal="g", backend="codex", prompt="p",
        )
        record = await manager.wait_terminal(job.job_id, timeout=10)

        assert record.status == "succeeded"
        assert record.result is not None
        assert record.result["strategy_id"] == "cx_s1"
        assert record.result["run_id"] == "run-42"
        # サンドボックス指定が実際にプロセスへ渡っている（build_agent_argv の
        # 単体テストだけでは JobManager 側の取り違えを検出できない）
        argv = (tmp_path / "argv.txt").read_text(encoding="utf-8").splitlines()
        assert argv[0] == "exec"
        assert argv[argv.index("--sandbox") + 1] == "workspace-write"
        assert argv[-1] == "p"

        _, lines = manager.log_since(job.job_id, 0)
        joined = "\n".join(lines)
        assert "[cmd: alpha-forge backtest run]" in joined
        assert "partial-should-not-appear" not in joined


def test_forge_job_kind_excludes_agent() -> None:
    """WHY: build_argv に "agent" を渡すと wft 分岐に落ち、まったく別の
    forge サブコマンドの argv を組んでしまう。型で受理しないことを保証する
    （検証者は mypy。ここでは各 Literal の関係が崩れていないことを押さえる）。
    """
    assert "agent" not in get_args(jobs.ForgeJobKind)
    assert "agent" not in get_args(jobs.DataJobKind)
    assert "agent" not in get_args(jobs.LiveJobKind)
    # JobKind = forge 系 + data 系 + live 系 + agent の直和（重複なし）
    assert set(get_args(jobs.JobKind)) == (
        set(get_args(jobs.ForgeJobKind))
        | set(get_args(jobs.DataJobKind))
        | set(get_args(jobs.LiveJobKind))
        | {"agent"}
    )
    assert not set(get_args(jobs.ForgeJobKind)) & set(get_args(jobs.DataJobKind))
    assert not set(get_args(jobs.ForgeJobKind)) & set(get_args(jobs.LiveJobKind))
    assert not set(get_args(jobs.DataJobKind)) & set(get_args(jobs.LiveJobKind))
