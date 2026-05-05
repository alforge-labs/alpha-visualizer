"""バックテスト実行 API ルーター

``POST /api/run`` を提供する。
forge backtest run をサブプロセスで実行し、完了後に forge_db から
最新の run_id を取得して返す。
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class RunBacktestRequest(BaseModel):
    strategy_id: str
    symbol: str
    timeframe: str


class RunBacktestResponse(BaseModel):
    run_id: str
    status: str


@router.post("/run", response_model=RunBacktestResponse)
def run_backtest(body: RunBacktestRequest, request: Request) -> RunBacktestResponse:
    """forge backtest run をサブプロセス実行し、最新の run_id を返す。"""
    forge_cfg = request.app.state.forge_config

    forge_exe = shutil.which("forge")
    if forge_exe is None:
        raise HTTPException(
            status_code=500,
            detail="forge コマンドが見つかりません / forge command not found in PATH",
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
        raise HTTPException(status_code=500, detail=detail)

    run_id = _latest_run_id(forge_cfg.forge_db, body.strategy_id, body.symbol)
    if run_id is None:
        raise HTTPException(
            status_code=500,
            detail="バックテスト結果が見つかりません / Backtest result not found in DB",
        )

    return RunBacktestResponse(run_id=run_id, status="ok")


def _latest_run_id(db_path: Path, strategy_id: str, symbol: str) -> str | None:
    """バックテスト DB から最新の run_id を取得する。"""
    if not db_path.exists():
        return None
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT run_id FROM backtest_results"
            " WHERE strategy_id = ? AND symbol = ?"
            " ORDER BY run_at DESC LIMIT 1",
            (strategy_id, symbol),
        ).fetchone()
    return row[0] if row else None
