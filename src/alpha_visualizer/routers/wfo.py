"""ウォークフォーワード結果 API ルーター。

`/api/wfo/{strategy_id}` を提供する。整形ロジックは ``services.wfo`` に
集約してあり、本ルーターは Repository アクセスと HTTP 変換のみを担う。
"""
from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from alpha_visualizer.dependencies import (
    get_forge_config_dep,
    get_optimization_repo,
    get_strategies_repo,
)
from alpha_visualizer.errors import AlphaVisualizerError, NotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.repositories.strategies import StrategiesRepository
from alpha_visualizer.schemas.wfo import WFOResponse
from alpha_visualizer.services import wfo as wfo_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_strategy_name(
    strategies_repo: StrategiesRepository, strategy_id: str
) -> str:
    """戦略名を ``StrategiesRepository`` から解決する（DB / JSON 両モード対応）。"""
    row = strategies_repo.get_strategy(strategy_id)
    return row.name if row is not None else strategy_id


@router.get("/wfo/{strategy_id}", response_model=WFOResponse)
async def get_wfo(
    strategy_id: str,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    repo: Annotated[OptimizationRepository, Depends(get_optimization_repo)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
) -> dict[str, Any]:
    if not config.forge_db.exists():
        raise NotFoundError("バックテスト DB が見つかりません")

    try:
        runs = repo.list_runs_for_strategy(strategy_id)

        windows: list[dict[str, Any]] = []
        symbol = ""
        for run in runs:
            if not symbol:
                symbol = str(run.symbol or "")
            all_trials: list[dict[str, Any]] | None = None
            if run.all_trials_json:
                try:
                    all_trials = json.loads(run.all_trials_json)
                except (json.JSONDecodeError, TypeError):
                    pass
            windows = wfo_service.extract_windows(all_trials)
            if windows:
                break

        if not windows:
            raise NotFoundError(
                f"WFO 形式の最適化結果が見つかりません: {strategy_id}",
            )

        try:
            composite_equity, composite_dates = wfo_service.extract_composite_curve(
                windows,
                lambda oos_start: repo.find_oos_equity_curve_json(
                    strategy_id, oos_start
                ),
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("composite curve 生成に失敗: %s (%s)", strategy_id, e)
            composite_equity, composite_dates = [], []

    except AlphaVisualizerError:
        raise
    except Exception as e:
        logger.warning("WFO 取得に失敗: %s (%s)", strategy_id, e)
        raise NotFoundError(
            f"WFO 結果の取得に失敗しました: {strategy_id}"
        ) from e

    return {
        "strategy_id": strategy_id,
        "strategy_name": _resolve_strategy_name(strategies_repo, strategy_id),
        "symbol": symbol,
        "windows": windows,
        "composite_equity": composite_equity,
        "composite_dates": composite_dates,
    }
