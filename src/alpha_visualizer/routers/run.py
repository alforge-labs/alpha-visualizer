"""バックテスト実行 API ルーター

``POST /api/run`` を提供する。
forge backtest run を ``--json`` 付きでサブプロセス実行し、stdout の JSON から
run_id を取得して返す。古い forge（--json に run_id 非搭載）では従来どおり
``BacktestResultsRepository`` の最新 run_id にフォールバックする（#291）。
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import shutil
import subprocess
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from alpha_visualizer.dependencies import (
    get_backtest_results_repo,
    get_forge_config_dep,
)
from alpha_visualizer.errors import DataCorruptError, ExternalProcessError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository

logger = logging.getLogger(__name__)

router = APIRouter()

# バックテスト 1 本の想定上限。銘柄・期間によっては数分かかるため余裕を持たせつつ、
# forge のハングで API ワーカーが無期限に塞がる事態だけは防ぐ。
DEFAULT_RUN_TIMEOUT_SEC = 600
RUN_TIMEOUT_ENV = "ALPHA_VIS_RUN_TIMEOUT"

LOG_TAIL_MAX_LINES = 50


class RunBacktestRequest(BaseModel):
    # timeframe は受け取らない: forge backtest run に timeframe フラグは存在せず、
    # 戦略定義（strategy JSON）の timeframe が使われる。旧フロントが送ってきた
    # 場合も extra="ignore"（明示）で互換を保つ。
    model_config = ConfigDict(extra="ignore")

    strategy_id: str = Field(min_length=1)
    symbol: str = Field(min_length=1)


class RunBacktestResponse(BaseModel):
    run_id: str
    status: str
    log_tail: str | None = None


def _resolve_timeout() -> int:
    """環境変数 ALPHA_VIS_RUN_TIMEOUT から timeout 秒を解決する。

    不正値でリクエストを落とすとタイポひとつで Run が全滅するため、
    警告ログを出してデフォルトで続行する。0 以下も弾く（0 は即時
    TimeoutExpired、負値は subprocess の ValueError になるため）。
    """
    raw = os.environ.get(RUN_TIMEOUT_ENV)
    if raw is None:
        return DEFAULT_RUN_TIMEOUT_SEC
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value <= 0:
        logger.warning(
            "%s の値が正の整数ではありません（デフォルト %d 秒を使用）",
            RUN_TIMEOUT_ENV,
            DEFAULT_RUN_TIMEOUT_SEC,
        )
        return DEFAULT_RUN_TIMEOUT_SEC
    return value


def _parse_run_id(stdout: str) -> str | None:
    """``--json`` の stdout から run_id を取り出す。

    forge #1232（v0.17 系）以降は JSON 本体に run_id が載る。stdout 全体が
    JSON でない場合も、警告行などが前後に混ざっただけの可能性があるため、
    最初の ``{`` から最後の ``}`` までの抽出を試す。それでも取れなければ
    None を返し、呼び出し側で DB フォールバックする。
    """
    candidates = [stdout]
    start = stdout.find("{")
    end = stdout.rfind("}")
    if 0 <= start < end:
        candidates.append(stdout[start : end + 1])
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(data, dict):
            continue
        run_id = data.get("run_id")
        if isinstance(run_id, str) and run_id:
            return run_id
    return None


def _mask_home(text: str) -> str:
    """ホームディレクトリの絶対パスを ``~`` にマスクする。

    forge の出力にはデータ保存先などの絶対パスが含まれうる。非 localhost
    バインドで公開された場合にユーザー名等の実行環境情報が API レスポンス
    経由で漏れないようにする。
    """
    home = str(pathlib.Path.home())
    return text.replace(home, "~")


def _log_tail(stderr: str) -> str | None:
    """stderr の末尾 LOG_TAIL_MAX_LINES 行を返す（空なら None）。"""
    text = stderr.strip()
    if not text:
        return None
    lines = text.splitlines()
    return _mask_home("\n".join(lines[-LOG_TAIL_MAX_LINES:]))


@router.post("/run", response_model=RunBacktestResponse)
def run_backtest(
    body: RunBacktestRequest,
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    bt_repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
) -> RunBacktestResponse:
    """forge backtest run をサブプロセス実行し、run_id と実行ログ末尾を返す。"""
    forge_exe = shutil.which("forge")
    if forge_exe is None:
        # Run 実行時が AlphaForge 導入意欲の最も高い接点なので、
        # インストール先への導線をエラーメッセージに含める。
        raise ExternalProcessError(
            "forge コマンドが見つかりません。AlphaForge を導入してください"
            " / forge command not found in PATH. Install AlphaForge"
            " — https://alforgelabs.com",
        )

    env = os.environ.copy()
    # 破壊的操作の確認プロンプト（forge_confirm）を非対話化する。
    # 注意: EULA 未同意時の Confirm.ask() はこれでは防げない（非対話同意は
    # FORGE_ACCEPT_EULA のみ）。勝手に EULA へ同意するのは避け、stdin を
    # 閉じることでハングせず即座に失敗させる（下の stdin=DEVNULL）。
    env["FORGE_NONINTERACTIVE"] = "1"
    forge_yaml = forge_cfg.forge_dir / "forge.yaml"
    if forge_yaml.exists():
        env["FORGE_CONFIG"] = str(forge_yaml)

    timeout = _resolve_timeout()
    try:
        proc = subprocess.run(
            [
                forge_exe,
                "backtest",
                "run",
                "--strategy",
                body.strategy_id,
                "--json",
                # -- 以降は positional 扱い: symbol が「-」始まりでも
                # オプションと誤解釈されない。
                "--",
                body.symbol,
            ],
            capture_output=True,
            text=True,
            env=env,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as exc:
        raise ExternalProcessError(
            f"バックテストが {timeout} 秒以内に完了しませんでした"
            f" / Backtest did not finish within {timeout} seconds",
        ) from exc

    if proc.returncode != 0:
        # 成功時 log_tail と同じ末尾丸め＋ホームパスマスクを通し、
        # 長大なトレースバックでレスポンスが膨らまないようにする。
        detail = (
            _log_tail(proc.stderr)
            or "バックテストの実行に失敗しました / Backtest execution failed"
        )
        raise ExternalProcessError(detail)

    run_id = _parse_run_id(proc.stdout)
    if run_id is None:
        # 旧 forge 互換: --json に run_id が載らないバージョンでは
        # 従来どおり DB の最新 run_id を拾う（並行実行時はレースの可能性あり）。
        # 旧 forge なのかパース失敗なのか運用時に切り分けられるようログを残す。
        logger.info(
            "stdout から run_id を取得できず DB フォールバックしました"
            "（旧 forge または --json 出力のパース失敗）"
        )
        # backtest_results.db が未生成のときに Repository が OperationalError を
        # 投げないよう、先にファイル存在を確認してから問い合わせる。
        if forge_cfg.forge_db.exists():
            run_id = bt_repo.find_latest_run_id(
                strategy_id=body.strategy_id,
                symbol=body.symbol,
            )
    if run_id is None:
        raise DataCorruptError(
            "バックテスト結果が見つかりません / Backtest result not found in DB",
        )

    return RunBacktestResponse(run_id=run_id, status="ok", log_tail=_log_tail(proc.stderr))
