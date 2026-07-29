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
    limit: int | None = Query(
        default=None, ge=1, description="返す最大件数（省略時は全件・従来互換）"
    ),
    offset: int = Query(default=0, ge=0, description="読み飛ばす件数"),
) -> list[dict[str, Any]]:
    # ``since`` のバリデーションは ``backtest_results.db`` 不在時でも 400 を返すため
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
    if since_dt is None:
        # SQL 側で limit/offset を適用（blob 列も読まない, issue #384）
        rows = repo.list_results_summary(
            strategy_id=strategy_id, limit=limit, offset=offset
        )
    else:
        # since は run_at を Python 側でパースして比較するため（形式ゆらぎ対応）、
        # フィルタ後にページングしないと件数がずれる
        rows = bt_service.filter_by_since(
            repo.list_results_summary(strategy_id=strategy_id), since_dt
        )
        end = None if limit is None else offset + limit
        rows = rows[offset:end]
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
