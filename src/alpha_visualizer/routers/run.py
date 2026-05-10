"""バックテスト実行 API ルーター

``POST /api/run`` を提供する。
forge backtest run をサブプロセスで実行し、完了後に
``BacktestResultsRepository`` で最新の run_id を取得して返す。
"""
from __future__ import annotations

import os
import shutil
import subprocess
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from alpha_visualizer.dependencies import (
    get_backtest_results_repo,
    get_forge_config_dep,
)
from alpha_visualizer.errors import DataCorruptError, ExternalProcessError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository

router = APIRouter()


class RunBacktestRequest(BaseModel):
    strategy_id: str
    symbol: str
    timeframe: str


class RunBacktestResponse(BaseModel):
    run_id: str
    status: str


@router.post("/run", response_model=RunBacktestResponse)
def run_backtest(
    body: RunBacktestRequest,
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    bt_repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
) -> RunBacktestResponse:
    """forge backtest run をサブプロセス実行し、最新の run_id を返す。"""
    forge_exe = shutil.which("forge")
    if forge_exe is None:
        raise ExternalProcessError(
            "forge コマンドが見つかりません / forge command not found in PATH",
        )

    env = os.environ.copy()
    forge_yaml = forge_cfg.forge_dir / "forge.yaml"
    if forge_yaml.exists():
        env["FORGE_CONFIG"] = str(forge_yaml)

    proc = subprocess.run(
        [forge_exe, "backtest", "run", body.symbol, "--strategy", body.strategy_id],
        capture_output=True,
        text=True,
        env=env,
    )

    if proc.returncode != 0:
        detail = (
            proc.stderr.strip()
            or "バックテストの実行に失敗しました / Backtest execution failed"
        )
        raise ExternalProcessError(detail)

    # backtest_results.db が未生成のときに Repository が OperationalError を投げないよう、
    # 先にファイル存在を確認してから問い合わせる。
    if not forge_cfg.forge_db.exists():
        run_id = None
    else:
        run_id = bt_repo.find_latest_run_id(
            strategy_id=body.strategy_id,
            symbol=body.symbol,
        )
    if run_id is None:
        raise DataCorruptError(
            "バックテスト結果が見つかりません / Backtest result not found in DB",
        )

    return RunBacktestResponse(run_id=run_id, status="ok")
