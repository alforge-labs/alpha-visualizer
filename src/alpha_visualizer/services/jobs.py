"""非同期ジョブ基盤（GUI化 Wave B, #292 / AI 戦略開発 #470）。

外部 CLI をバックグラウンドプロセスとして起動・監視する in-process ジョブ
マネージャ。扱う CLI は 2 種類ある:

- forge ジョブ（backtest / optimize / wft）: alpha-forge CLI
- agent ジョブ: claude / codex のヘッドレス CLI（AI 戦略開発）

uvicorn 単一ワーカー前提で、ジョブ状態はプロセスメモリにのみ保持する
（サーバー再起動で消える）。

設計メモ:
- 進捗ログの源は kind で異なる。forge は stderr のみ（--json 契約では stdout は
  結果 JSON）。agent は stdout の JSONL イベントを整形したものが主で、stderr も
  併せて載せる
- 結果の取り出しも kind で異なる。forge は stdout 全体の JSON、agent は
  stdout イベント列から抽出した最終テキスト内の JSON
- agent ジョブのみ cwd を forge ワークスペースに固定する（権限モデル）
- 同時実行数は Semaphore で制御（既定 1、``ALPHA_VIS_JOB_CONCURRENCY``）
- キャンセルは terminate → 猶予後 kill の 2 段階
- 結果はスカラーのみに圧縮して保持（equity_curve 等の巨大配列は捨てる）
- SSE 消費者向けに単一の Condition + 単調増加 version で変更通知する
"""
from __future__ import annotations

import asyncio
import builtins
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
from alpha_visualizer.services.agent_cli import (
    AGENT_MAX_TURNS_MESSAGE,
    AGENT_NOT_FOUND_MESSAGES,
    DEFAULT_CLAUDE_MAX_TURNS,
    AgentBackend,
    build_agent_argv,
    resolve_agent_exe,
    translate_agent_failure,
)
from alpha_visualizer.services.agent_events import (
    extract_final_text,
    extract_result_subtype,
    format_agent_event,
)
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    build_forge_env,
    mask_home,
    parse_json_lenient,
    resolve_forge_exe,
    translate_forge_failure,
)

logger = logging.getLogger(__name__)

# forge CLI で実行するジョブ種。build_argv はこれだけを受理する:
# "agent" を渡せてしまうと wft 分岐に落ち、まったく別の forge サブコマンドの
# argv を静かに組んでしまうため、型で受け付けない。
ForgeJobKind = Literal["backtest", "optimize", "wft"]
JobKind = Literal["backtest", "optimize", "wft", "agent"]
JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]

TERMINAL_STATUSES: frozenset[str] = frozenset({"succeeded", "failed", "cancelled"})

DEFAULT_JOB_TIMEOUT_SEC = 3600
JOB_TIMEOUT_ENV = "ALPHA_VIS_JOB_TIMEOUT"
DEFAULT_JOB_CONCURRENCY = 1
JOB_CONCURRENCY_ENV = "ALPHA_VIS_JOB_CONCURRENCY"
DEFAULT_AGENT_TIMEOUT_SEC = 1800
AGENT_TIMEOUT_ENV = "ALPHA_VIS_AGENT_TIMEOUT"
AGENT_MAX_TURNS_ENV = "ALPHA_VIS_AGENT_MAX_TURNS"

# ログはジョブごとに末尾 MAX 行のみ保持（seq は通算なので SSE 再接続にも耐える）
LOG_MAX_LINES = 500
# 終了済みジョブの保持上限（超過した古い terminal ジョブから捨てる）
MAX_JOBS_KEPT = 50
# 非 terminal（queued / running）ジョブの上限。これが無いと大量作成で
# セマフォ待ちタスクが際限なく積み上がる（流量ガード）
MAX_ACTIVE_JOBS = 20
# stdout（結果 JSON）の取り込み上限。これを超える分は切り捨てる
STDOUT_MAX_BYTES = 20 * 1024 * 1024
# stdout の行分割バッファ上限。改行の来ない巨大な 1 行でバッファが際限なく
# 伸びるのを防ぐ（stderr 側の STDERR_LINE_MAX と対になるガード）
STDOUT_LINE_MAX = 1024 * 1024
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
            # プロセスグループが既に消えている / 権限が無い場合は、
            # 下の単体 kill にフォールバックする（意図的に握り潰す）
            pass
    try:
        if force:
            proc.kill()
        else:
            proc.terminate()
    except ProcessLookupError:
        # 単体 kill の時点で既に終了済み。目的（終了させること）は
        # 達成されているため何もしない
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
    kind: ForgeJobKind,
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
        # --save は forge#1293 で追加: WFT 結果が optimization_runs に window 形式で
        # 保存され、WFO タブに反映される（optimize と同じ「--save 必須」の理由）
        argv = [
            forge_exe, "optimize", "walk-forward",
            "--strategy", strategy_id, "--save", "--json",
        ]
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


def _cleanup_strategy_file(record: JobRecord) -> None:
    """チューニング用の一時戦略ファイルを片付ける（失敗しても致命的でない）。"""
    if record.strategy_file is None:
        return
    try:
        pathlib.Path(record.strategy_file).unlink()
    except OSError:
        logger.debug("一時戦略ファイルの削除に失敗: %s", record.strategy_file)


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
    # agent ジョブ（AI 戦略開発）専用。forge ジョブでは常に None。
    goal: str | None = None
    backend: str | None = None
    prompt: str | None = None
    # ターン上限の明示指定（GUI / API から。None なら JobManager の既定値）
    max_turns: int | None = None
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
        agent_resolver: Callable[[AgentBackend], str | None] = resolve_agent_exe,
        agent_timeout_sec: int | None = None,
        agent_max_turns: int | None = None,
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
        self._agent_resolver = agent_resolver
        self._agent_timeout_sec = agent_timeout_sec or _env_int(
            AGENT_TIMEOUT_ENV, DEFAULT_AGENT_TIMEOUT_SEC
        )
        self._agent_max_turns = agent_max_turns or _env_int(
            AGENT_MAX_TURNS_ENV, DEFAULT_CLAUDE_MAX_TURNS
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

    # メソッド名 ``list`` がクラススコープで組み込み list を隠すため、
    # ここでは builtins 経由で参照する（mypy valid-type 対策・issue #393）
    def log_since(self, job_id: str, since_seq: int) -> tuple[int, builtins.list[str]]:
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
        goal: str | None = None,
        backend: str | None = None,
        prompt: str | None = None,
        max_turns: int | None = None,
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
            goal=goal,
            backend=backend,
            prompt=prompt,
            max_turns=max_turns,
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
        # （このパスは _finish() を通らないため一時戦略ファイルもここで掃除する）
        for record in self._jobs.values():
            if record.status not in TERMINAL_STATUSES:
                record.status = "cancelled"
                record.finished_at = datetime.now(UTC)
                _cleanup_strategy_file(record)

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
        _cleanup_strategy_file(record)
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
        stdout_line_handler: Callable[[str], str | None] | None = None
        cwd: str | None = None
        # agent 分岐でのみ意味を持つが、失敗処理から参照するため先に確定させる
        turn_limit = self._agent_max_turns
        if record.kind == "agent":
            backend: AgentBackend = "codex" if record.backend == "codex" else "claude"
            exe = self._agent_resolver(backend)
            if exe is None:
                await self._finish(
                    record, "failed", error=AGENT_NOT_FOUND_MESSAGES[backend]
                )
                return
            workspace = self._forge_config.forge_dir
            turn_limit = record.max_turns or turn_limit
            argv = build_agent_argv(
                exe, backend, record.prompt or "", workspace, turn_limit
            )
            timeout_sec = self._agent_timeout_sec
            # エージェントの相対パス操作をワークスペース内に固定する（権限モデル）
            cwd = str(workspace)
            # 最終結果（type=result 等）は stream-json の最後に来るため、
            # STDOUT_MAX_BYTES 到達で stdout_buf が打ち切られると結果だけを
            # 静かに失う。行分割はバッファ上限と無関係に行われるので、ここで
            # 行ごとに逐次抽出し、最後に見つかった値を独立して保持する。
            final_text_holder: list[str] = []

            def stdout_line_handler(line: str) -> str | None:
                final = extract_final_text(backend, line)
                if final is not None:
                    final_text_holder[:] = [final]
                return format_agent_event(backend, line)
        else:
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
            timeout_sec = self._timeout_sec

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
            cwd=cwd,
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
            buf = b""
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    if buf and stdout_line_handler is not None:
                        formatted = stdout_line_handler(
                            buf.decode("utf-8", errors="replace")
                        )
                        if formatted is not None:
                            await self._append_log(record, formatted)
                    return
                if len(stdout_buf) < STDOUT_MAX_BYTES:
                    stdout_buf.extend(chunk)
                if stdout_line_handler is None:
                    continue
                buf += chunk
                *complete, buf = buf.split(b"\n")
                for raw in complete:
                    formatted = stdout_line_handler(
                        raw.decode("utf-8", errors="replace")
                    )
                    if formatted is not None:
                        await self._append_log(record, formatted)
                if len(buf) > STDOUT_LINE_MAX:
                    # 改行の来ない巨大行はイベント JSON として解釈できないため、
                    # stderr 側（生ログを切り出して残す）と違い捨てる。残骸は
                    # 次の改行までが 1 行として渡り、非 JSON なのでログに載らない。
                    logger.warning(
                        "job %s の stdout に改行の無い巨大な行があるため切り捨てます",
                        record.job_id,
                    )
                    buf = b""

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
            await asyncio.wait_for(proc.wait(), timeout=timeout_sec)
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
                    # 自分で cancel() したタスクを await した際の想定内の送出。
                    # 呼び出し元は cancel されていないので伝播させない
                    pass

        if timed_out:
            await self._finish(
                record,
                "failed",
                returncode=proc.returncode,
                error=(
                    f"ジョブが {timeout_sec} 秒以内に完了しませんでした"
                    f" / Job did not finish within {timeout_sec} seconds"
                ),
            )
            return

        if record.cancel_requested:
            await self._finish(record, "cancelled", returncode=proc.returncode)
            return

        stdout_text = stdout_buf.decode("utf-8", errors="replace")

        if proc.returncode != 0:
            # 既知の失敗（EULA 未同意等）は次の一歩を示す案内に変換する。
            # ログ（stderr 由来）だけでは EULA プロンプト本体を拾えないため、
            # stdout も合わせて判定する。
            _, tail = self.log_since(record.job_id, max(0, record.log_seq - 5))
            log_text = "\n".join(tail)
            if record.kind == "agent":
                backend = "codex" if record.backend == "codex" else "claude"
                # 原因判定は構造化イベント（result.subtype）を最優先にする。
                # ここで translate_forge_failure のような本文の部分一致を使っては
                # ならない: agent の stdout には自身の発話とツール出力が丸ごと
                # 含まれるため、ワークスペース内の無関係なファイルを読んだだけで
                # 誤診断する（実際に EULA 未同意と誤って案内した事例がある）。
                subtype = extract_result_subtype(backend, stdout_text)
                turn_limit_error = (
                    AGENT_MAX_TURNS_MESSAGE.format(limit=turn_limit)
                    if subtype == "error_max_turns"
                    else None
                )
                error = (
                    turn_limit_error
                    or translate_agent_failure(backend, stdout_text, log_text)
                    or log_text
                    or "エージェントの実行に失敗しました / Agent execution failed"
                )
            else:
                error = (
                    translate_forge_failure(stdout_text, log_text)
                    or log_text
                    or "ジョブの実行に失敗しました / Job execution failed"
                )
            await self._finish(
                record, "failed", returncode=proc.returncode, error=error
            )
            return

        if record.kind == "agent":
            final_text = final_text_holder[-1] if final_text_holder else None
            data = parse_json_lenient(final_text) if final_text else None
            result = _compact_result(data) if data is not None else None
            # ジョブ一覧から生成物へ辿れるよう、判明した strategy_id を書き戻す
            if result is not None and isinstance(result.get("strategy_id"), str):
                record.strategy_id = result["strategy_id"]
            await self._finish(record, "succeeded", returncode=0, result=result)
            return

        data = parse_json_lenient(stdout_text)
        result = _compact_result(data) if data is not None else None
        await self._finish(record, "succeeded", returncode=0, result=result)
