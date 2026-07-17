"""非同期ジョブ基盤（GUI化 Wave B, #292）。

forge CLI（backtest / optimize / walk-forward）をバックグラウンドプロセスとして
起動・監視する in-process ジョブマネージャ。uvicorn 単一ワーカー前提で、
ジョブ状態はプロセスメモリにのみ保持する（サーバー再起動で消える）。

設計メモ:
- 進捗ログ = stderr の行ストリーム（forge の --json 契約では stdout は結果 JSON）
- 同時実行数は Semaphore で制御（既定 1、``ALPHA_VIS_JOB_CONCURRENCY``）
- キャンセルは terminate → 猶予後 kill の 2 段階
- 結果はスカラーのみに圧縮して保持（equity_curve 等の巨大配列は捨てる）
- SSE 消費者向けに単一の Condition + 単調増加 version で変更通知する
"""
from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import signal
import subprocess
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from alpha_visualizer.errors import TooManyJobsError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    build_forge_env,
    mask_home,
    parse_json_lenient,
    resolve_forge_exe,
)

logger = logging.getLogger(__name__)

JobKind = Literal["backtest", "optimize", "wft"]
JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]

TERMINAL_STATUSES: frozenset[str] = frozenset({"succeeded", "failed", "cancelled"})

DEFAULT_JOB_TIMEOUT_SEC = 3600
JOB_TIMEOUT_ENV = "ALPHA_VIS_JOB_TIMEOUT"
DEFAULT_JOB_CONCURRENCY = 1
JOB_CONCURRENCY_ENV = "ALPHA_VIS_JOB_CONCURRENCY"

# ログはジョブごとに末尾 MAX 行のみ保持（seq は通算なので SSE 再接続にも耐える）
LOG_MAX_LINES = 500
# 終了済みジョブの保持上限（超過した古い terminal ジョブから捨てる）
MAX_JOBS_KEPT = 50
# 非 terminal（queued / running）ジョブの上限。これが無いと大量作成で
# セマフォ待ちタスクが際限なく積み上がる（流量ガード）
MAX_ACTIVE_JOBS = 20
# stdout（結果 JSON）の取り込み上限。これを超える分は切り捨てる
STDOUT_MAX_BYTES = 20 * 1024 * 1024
# terminate 後にプロセスが残った場合の kill までの猶予秒
CANCEL_KILL_GRACE_SEC = 5.0


def _signal_process_tree(proc: asyncio.subprocess.Process, *, force: bool) -> None:
    """プロセスグループ全体へ TERM / KILL を送る。

    forge（PyInstaller バイナリ等）は子プロセスを持ちうる。子だけを kill しても
    孫がパイプを握り続けると asyncio の ``Process.wait()`` はパイプ切断まで
    返らないため、POSIX では ``start_new_session=True`` で作ったグループごと
    シグナルを送る。グループ操作に失敗した場合や Windows では単体 kill に
    フォールバックする。
    """
    if os.name == "posix":
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGKILL if force else signal.SIGTERM)
            return
        except (ProcessLookupError, PermissionError):
            pass
    try:
        if force:
            proc.kill()
        else:
            proc.terminate()
    except ProcessLookupError:
        pass


def _env_int(name: str, default: int) -> int:
    """環境変数から正の整数を読む（不正値・0 以下は警告してデフォルト）。"""
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value <= 0:
        logger.warning("%s の値が正の整数ではありません（デフォルト %d を使用）", name, default)
        return default
    return value


def build_argv(
    forge_exe: str,
    kind: JobKind,
    strategy_id: str,
    symbol: str,
    trials: int | None,
    windows: int | None,
    strategy_file: str | None = None,
) -> list[str]:
    """kind に応じた forge CLI の argv を構築する。

    symbol は必ず ``--`` の後ろに置く（「-」始まりの入力がオプションと
    誤解釈されるのを防ぐ。/api/run と同じ契約）。
    optimize は ``--save`` 必須: これが無いと all_trials が DB に保存されず、
    Optimize タブに結果が反映されない。
    strategy_file はチューニング実行（#293）用: パラメータ差し替え済みの
    一時戦略 JSON を --strategy-file で渡す（--strategy と排他）。
    """
    if kind == "backtest":
        if strategy_file is not None:
            argv = [forge_exe, "backtest", "run", "--strategy-file", strategy_file, "--json"]
        else:
            argv = [forge_exe, "backtest", "run", "--strategy", strategy_id, "--json"]
    elif kind == "optimize":
        argv = [forge_exe, "optimize", "run", "--strategy", strategy_id, "--save", "--json"]
        if trials is not None:
            argv += ["--trials", str(trials)]
    else:  # wft
        argv = [forge_exe, "optimize", "walk-forward", "--strategy", strategy_id, "--json"]
        if windows is not None:
            argv += ["--windows", str(windows)]
    return [*argv, "--", symbol]


# 結果要約に保持するスカラー文字列の最大長（超過分は切り詰める）
RESULT_STR_MAX_CHARS = 500


def _compact_scalar(value: Any) -> Any:
    """スカラー値を安全なサイズ・内容に丸める。

    - 長い文字列は切り詰め
    - 文字列中のホームパスは ~ にマスク（optimize --save の stdout JSON には
      saved_path 等の絶対パスが含まれる。ログと同じ漏洩対策を結果要約にも適用）
    """
    if isinstance(value, str):
        masked = mask_home(value)
        if len(masked) > RESULT_STR_MAX_CHARS:
            return masked[:RESULT_STR_MAX_CHARS] + "…"
        return masked
    return value


def _compact_result(data: dict[str, Any]) -> dict[str, Any]:
    """結果 JSON をスカラー（と 1 段のスカラー dict）のみに圧縮する。

    equity_curve / trades / all_trials のような巨大配列を落とし、ジョブ結果を
    メモリ・レスポンスに安全に載せられるサイズに保つ。kind ごとのスキーマに
    依存しないよう、形状ベースの汎用ルールにしている。
    """
    out: dict[str, Any] = {}
    for key, value in data.items():
        if len(out) >= 40:
            break
        if value is None or isinstance(value, (str, int, float, bool)):
            out[key] = _compact_scalar(value)
        elif isinstance(value, dict):
            sub = {
                k: _compact_scalar(v)
                for k, v in list(value.items())[:40]
                if v is None or isinstance(v, (str, int, float, bool))
            }
            if sub:
                out[key] = sub
    return out


@dataclass
class JobRecord:
    """1 ジョブの状態。JobManager が唯一の書き手。"""

    job_id: str
    kind: JobKind
    strategy_id: str
    symbol: str
    trials: int | None
    windows: int | None
    created_at: datetime
    # チューニング実行（#293）: パラメータ差し替え済み一時戦略 JSON のパス。
    # ジョブ終了時に削除される。
    strategy_file: str | None = None
    status: JobStatus = "queued"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    returncode: int | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    # ログは末尾 LOG_MAX_LINES 行のみ保持。log_offset は捨てた行数で、
    # 通算 seq = log_offset + len(log_lines)。
    log_lines: list[str] = field(default_factory=list)
    log_offset: int = 0
    cancel_requested: bool = False

    @property
    def log_seq(self) -> int:
        return self.log_offset + len(self.log_lines)


class JobManager:
    """forge CLI ジョブの生成・監視・キャンセルを担う in-process マネージャ。"""

    def __init__(
        self,
        forge_config: ForgeConfig,
        forge_resolver: Callable[[], str | None] = resolve_forge_exe,
        concurrency: int | None = None,
        timeout_sec: int | None = None,
        max_active: int | None = None,
    ) -> None:
        self._forge_config = forge_config
        self._forge_resolver = forge_resolver
        self._max_active = max_active or MAX_ACTIVE_JOBS
        self._concurrency = concurrency or _env_int(
            JOB_CONCURRENCY_ENV, DEFAULT_JOB_CONCURRENCY
        )
        self._timeout_sec = timeout_sec or _env_int(
            JOB_TIMEOUT_ENV, DEFAULT_JOB_TIMEOUT_SEC
        )
        self._jobs: dict[str, JobRecord] = {}
        self._order: list[str] = []  # 作成順（古い→新しい）
        self._procs: dict[str, asyncio.subprocess.Process] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._semaphore = asyncio.Semaphore(self._concurrency)
        self._cond = asyncio.Condition()
        self._version = 0

    # ---- 参照系 -------------------------------------------------------- #

    @property
    def version(self) -> int:
        """変更通知用の単調増加バージョン。"""
        return self._version

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    def list(self) -> list[JobRecord]:
        """新しい順のジョブ一覧。"""
        return [self._jobs[jid] for jid in reversed(self._order)]

    def log_since(self, job_id: str, since_seq: int) -> tuple[int, list[str]]:
        """通算 seq ``since_seq`` 以降のログ行を返す。

        Returns:
            (現在の通算 seq, 新規行のリスト)。保持上限を超えて捨てられた行は
            返せない（その場合は保持している先頭から返す）。
        """
        record = self._jobs[job_id]
        start = max(0, since_seq - record.log_offset)
        return record.log_seq, list(record.log_lines[start:])

    # ---- 変更通知 ------------------------------------------------------ #

    async def _notify(self) -> None:
        async with self._cond:
            self._version += 1
            self._cond.notify_all()

    async def wait_change(self, seen_version: int, timeout: float) -> bool:
        """version が進むまで待つ。timeout したら False。"""
        try:
            async with self._cond:
                await asyncio.wait_for(
                    self._cond.wait_for(lambda: self._version > seen_version),
                    timeout=timeout,
                )
            return True
        except TimeoutError:
            return False

    async def wait_status(self, job_id: str, status: JobStatus, timeout: float) -> JobRecord:
        """指定ステータス（または terminal）到達まで待つテスト・内部用ヘルパー。

        注意: 指定 status に到達しないまま terminal（failed 等）で終わった場合も
        正常リターンする。呼び出し側は返り値の status を確認すること。
        """
        deadline = asyncio.get_running_loop().time() + timeout
        while True:
            record = self._jobs[job_id]
            if record.status == status or record.status in TERMINAL_STATUSES:
                return record
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise TimeoutError(f"job {job_id} は {timeout} 秒以内に {status} になりませんでした")
            await self.wait_change(self._version, timeout=remaining)

    async def wait_terminal(self, job_id: str, timeout: float) -> JobRecord:
        """terminal ステータス到達まで待って JobRecord を返す。"""
        deadline = asyncio.get_running_loop().time() + timeout
        while True:
            record = self._jobs[job_id]
            if record.status in TERMINAL_STATUSES:
                return record
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise TimeoutError(f"job {job_id} は {timeout} 秒以内に終了しませんでした")
            await self.wait_change(self._version, timeout=remaining)

    # ---- 生成・キャンセル ------------------------------------------------ #

    async def create(
        self,
        kind: JobKind,
        strategy_id: str,
        symbol: str,
        trials: int | None = None,
        windows: int | None = None,
        strategy_file: str | None = None,
    ) -> JobRecord:
        """ジョブを登録し、バックグラウンド実行タスクを起動する。

        Raises:
            TooManyJobsError: 非 terminal ジョブが上限（max_active）に達している。
        """
        active = sum(
            1 for r in self._jobs.values() if r.status not in TERMINAL_STATUSES
        )
        if active >= self._max_active:
            raise TooManyJobsError(
                f"実行中・待機中のジョブが上限（{self._max_active}）に達しています。"
                f" 完了またはキャンセルを待ってください"
                f" / Too many active jobs (limit: {self._max_active})",
            )
        job_id = f"job-{uuid.uuid4().hex[:12]}"
        record = JobRecord(
            job_id=job_id,
            kind=kind,
            strategy_id=strategy_id,
            symbol=symbol,
            trials=trials,
            windows=windows,
            strategy_file=strategy_file,
            created_at=datetime.now(UTC),
        )
        self._jobs[job_id] = record
        self._order.append(job_id)
        self._prune()
        self._tasks[job_id] = asyncio.create_task(self._run_job(record))
        await self._notify()
        return record

    async def cancel(self, job_id: str) -> JobRecord:
        """ジョブをキャンセルする。

        - queued: 実行前フラグを立てる（ワーカーが起動前に検知して終了）
        - running: terminate → 猶予後 kill
        - terminal: 何もしない（現状を返す）
        """
        record = self._jobs[job_id]
        if record.status in TERMINAL_STATUSES:
            return record
        record.cancel_requested = True
        if record.status == "queued":
            # ワーカーはセマフォ取得後に cancel_requested を確認して終了する
            await self._notify()
            return record
        proc = self._procs.get(job_id)
        if proc is not None and proc.returncode is None:
            _signal_process_tree(proc, force=False)
            # 猶予後も残っていたら kill（fire-and-forget）
            asyncio.get_running_loop().call_later(
                CANCEL_KILL_GRACE_SEC, self._kill_if_alive, job_id
            )
        await self._notify()
        return record

    def _kill_if_alive(self, job_id: str) -> None:
        proc = self._procs.get(job_id)
        if proc is not None and proc.returncode is None:
            logger.warning("job %s が terminate に応答しないため kill します", job_id)
            _signal_process_tree(proc, force=True)

    async def shutdown(self) -> None:
        """実行中のジョブプロセスを止め、ワーカータスクを回収する（サーバー終了時）。

        forge は start_new_session でセッション分離しているため、これを呼ばずに
        サーバーを終了すると Ctrl+C の SIGINT が伝播せず孤児プロセスが残る。
        FastAPI の lifespan（shutdown 側）から呼ばれる想定。
        """
        for record in self._jobs.values():
            if record.status not in TERMINAL_STATUSES:
                record.cancel_requested = True
        for proc in list(self._procs.values()):
            if proc.returncode is None:
                _signal_process_tree(proc, force=True)
        await self._notify()

        pending = [t for t in self._tasks.values() if not t.done()]
        if pending:
            _done, still_pending = await asyncio.wait(pending, timeout=5.0)
            for task in still_pending:
                task.cancel()
            if still_pending:
                await asyncio.gather(*still_pending, return_exceptions=True)
        # タスクを強制キャンセルした場合に running のまま残る record を閉じる
        for record in self._jobs.values():
            if record.status not in TERMINAL_STATUSES:
                record.status = "cancelled"
                record.finished_at = datetime.now(UTC)

    def _prune(self) -> None:
        """terminal な古いジョブから保持上限まで間引く。"""
        while len(self._order) > MAX_JOBS_KEPT:
            for jid in self._order:
                if self._jobs[jid].status in TERMINAL_STATUSES:
                    self._order.remove(jid)
                    self._jobs.pop(jid, None)
                    self._tasks.pop(jid, None)
                    self._procs.pop(jid, None)
                    break
            else:
                # 全ジョブが実行中・待機中なら間引かない
                return

    # ---- ワーカー -------------------------------------------------------- #

    async def _append_log(self, record: JobRecord, line: str) -> None:
        record.log_lines.append(mask_home(line))
        if len(record.log_lines) > LOG_MAX_LINES:
            drop = len(record.log_lines) - LOG_MAX_LINES
            del record.log_lines[:drop]
            record.log_offset += drop
        await self._notify()

    async def _finish(
        self,
        record: JobRecord,
        status: JobStatus,
        *,
        returncode: int | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        record.status = status
        record.returncode = returncode
        record.result = result
        record.error = error
        record.finished_at = datetime.now(UTC)
        self._procs.pop(record.job_id, None)
        if record.strategy_file is not None:
            # チューニング用の一時戦略ファイルを片付ける（失敗しても致命的でない）
            try:
                pathlib.Path(record.strategy_file).unlink()
            except OSError:
                logger.debug("一時戦略ファイルの削除に失敗: %s", record.strategy_file)
        await self._notify()

    async def _run_job(self, record: JobRecord) -> None:
        try:
            # セマフォ取得は短いタイムアウト付きのポーリングにする:
            # queued のままブロックすると cancel を検知できないため。
            while True:
                if record.cancel_requested:
                    await self._finish(record, "cancelled")
                    return
                try:
                    await asyncio.wait_for(self._semaphore.acquire(), timeout=0.2)
                    break
                except TimeoutError:
                    continue
            try:
                if record.cancel_requested:
                    await self._finish(record, "cancelled")
                    return
                await self._execute(record)
            finally:
                self._semaphore.release()
        except Exception:
            # ワーカー内の想定外例外は握り潰さずログに残し、ジョブを failed にする
            logger.exception("job %s のワーカーで想定外のエラー", record.job_id)
            if record.status not in TERMINAL_STATUSES:
                await self._finish(
                    record,
                    "failed",
                    error="ジョブ実行中に内部エラーが発生しました / Internal error while running job",
                )

    async def _execute(self, record: JobRecord) -> None:
        forge_exe = self._forge_resolver()
        if forge_exe is None:
            await self._finish(record, "failed", error=FORGE_NOT_FOUND_MESSAGE)
            return

        argv = build_argv(
            forge_exe,
            record.kind,
            record.strategy_id,
            record.symbol,
            record.trials,
            record.windows,
            strategy_file=record.strategy_file,
        )
        spawn_kwargs: dict[str, Any] = {}
        if os.name == "posix":
            # キャンセル/タイムアウト時にプロセスグループごと kill できるようにする
            # （_signal_process_tree の docstring 参照）
            spawn_kwargs["start_new_session"] = True
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            # EULA 未同意時の Confirm.ask() ハングを fail-fast にする（/api/run と同じ）
            stdin=subprocess.DEVNULL,
            env=build_forge_env(self._forge_config),
            **spawn_kwargs,
        )
        self._procs[record.job_id] = proc
        # running の公開は proc 登録後に行う: 先に running を見せると、cancel() が
        # _procs に見つけられずシグナルを送れないレースになる。
        record.status = "running"
        record.started_at = datetime.now(UTC)
        await self._notify()
        # spawn 中に cancel が来ていた場合はここで即座に殺す
        # （cancel() 側は proc 未登録時フラグを立てるだけのため）。
        if record.cancel_requested:
            _signal_process_tree(proc, force=True)

        stdout_buf = bytearray()

        async def _pump_stdout() -> None:
            assert proc.stdout is not None
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    return
                if len(stdout_buf) < STDOUT_MAX_BYTES:
                    stdout_buf.extend(chunk)

        # 行分割は readline() でなくチャンク読みで自前処理する:
        # StreamReader.readline() は改行なしの 64KiB 超で ValueError を投げ、
        # ジョブが「内部エラー」に丸められてしまうため。
        STDERR_LINE_MAX = 64 * 1024

        async def _pump_stderr() -> None:
            assert proc.stderr is not None
            buf = b""
            while True:
                chunk = await proc.stderr.read(65536)
                if not chunk:
                    if buf:
                        await self._append_log(
                            record, buf.decode("utf-8", errors="replace").rstrip()
                        )
                    return
                buf += chunk
                *complete, buf = buf.split(b"\n")
                for raw in complete:
                    await self._append_log(
                        record, raw.decode("utf-8", errors="replace").rstrip()
                    )
                if len(buf) > STDERR_LINE_MAX:
                    # 改行の来ない巨大行は切り出してログへ吐き、バッファ肥大を防ぐ
                    await self._append_log(
                        record, buf.decode("utf-8", errors="replace")
                    )
                    buf = b""

        # パイプ回収はプロセス終了待ちと分離する: 子（sh）が死んでも孫プロセスが
        # パイプを握り続けると pump が EOF にならず、gather 一体待ちだと
        # terminate/kill 後もタイムアウトまで返ってこない。
        pump_out_task = asyncio.create_task(_pump_stdout())
        pump_err_task = asyncio.create_task(_pump_stderr())

        timed_out = False
        try:
            await asyncio.wait_for(proc.wait(), timeout=self._timeout_sec)
        except TimeoutError:
            timed_out = True
            _signal_process_tree(proc, force=True)
            await proc.wait()

        # プロセス終了後、パイプの残データを短時間だけ回収して打ち切る
        for pump_task in (pump_out_task, pump_err_task):
            try:
                await asyncio.wait_for(pump_task, timeout=1.0)
            except TimeoutError:
                pump_task.cancel()
                try:
                    await pump_task
                except asyncio.CancelledError:
                    pass

        if timed_out:
            await self._finish(
                record,
                "failed",
                returncode=proc.returncode,
                error=(
                    f"ジョブが {self._timeout_sec} 秒以内に完了しませんでした"
                    f" / Job did not finish within {self._timeout_sec} seconds"
                ),
            )
            return

        if record.cancel_requested:
            await self._finish(record, "cancelled", returncode=proc.returncode)
            return

        if proc.returncode != 0:
            _, tail = self.log_since(record.job_id, max(0, record.log_seq - 5))
            error = (
                "\n".join(tail)
                or "ジョブの実行に失敗しました / Job execution failed"
            )
            await self._finish(
                record, "failed", returncode=proc.returncode, error=error
            )
            return

        stdout_text = stdout_buf.decode("utf-8", errors="replace")
        data = parse_json_lenient(stdout_text)
        result = _compact_result(data) if data is not None else None
        await self._finish(record, "succeeded", returncode=0, result=result)
