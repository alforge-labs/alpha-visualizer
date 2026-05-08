"""バックテスト結果 API ルーター。

`/api/results` (一覧) と `/api/results/{run_id}` (詳細) を提供する。
HTTP 変換と DI のみを担当し、整形ロジックは ``services.backtest`` に移譲する。
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from alpha_visualizer.dependencies import (
    get_backtest_results_repo,
    get_forge_config_dep,
)
from alpha_visualizer.errors import InvalidRequestError, NotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository
from alpha_visualizer.schemas.results import BacktestDetail, BacktestSummary
from alpha_visualizer.services import backtest as bt_service

router = APIRouter()


@router.get("/results", response_model=list[BacktestSummary])
async def list_results(
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
    strategy_id: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    # ``since`` のバリデーションは ``forge.db`` 不在時でも 400 を返すため
    # 必ず DB アクセスより先に行う（既存挙動の保持）。
    since_dt: datetime | None = None
    if since:
        try:
            since_dt = bt_service.parse_dt(since)
        except ValueError as e:
            raise InvalidRequestError(
                f"since の形式が不正です: {since}"
            ) from e
    if not config.forge_db.exists():
        return []
    rows = repo.list_results(strategy_id=strategy_id)
    rows = bt_service.filter_by_since(rows, since_dt)
    return [bt_service.summarize_row(r) for r in rows]


@router.get("/results/{run_id}", response_model=BacktestDetail)
async def get_result(
    run_id: str,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
) -> dict[str, Any]:
    if not config.forge_db.exists():
        raise NotFoundError(f"run_id '{run_id}' が見つかりません")
    row = repo.get_result(run_id)
    if row is None:
        raise NotFoundError(f"run_id '{run_id}' が見つかりません")
    return bt_service.build_detail(row)


__all__ = ["router"]
