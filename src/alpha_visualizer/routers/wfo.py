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
from alpha_visualizer.log_sanitize import sanitize_for_log
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.repositories.strategies import StrategiesRepository
from alpha_visualizer.schemas.wfo import WFOResponse
from alpha_visualizer.services import walk_forward as wfo_service

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
        all_trials: list[dict[str, Any]] | None = None
        for run in runs:
            if not symbol:
                symbol = str(run.symbol or "")
            all_trials = None
            if run.all_trials_json:
                try:
                    all_trials = json.loads(run.all_trials_json)
                except (json.JSONDecodeError, TypeError) as exc:
                    # 破損 JSON や旧フォーマット混入時は trials なしで継続する
                    logger.debug("all_trials_json のパースに失敗: %s", exc)
            windows = wfo_service.extract_windows(all_trials)
            if windows:
                break

        if not windows:
            raise NotFoundError(
                f"WFO 形式の最適化結果が見つかりません: {strategy_id}",
            )

        # 採用ランの最適化指標名（非 sharpe の場合は表示ラベルを切り替える・vis#303）
        metric_name = wfo_service.resolve_metric_name(all_trials)

        try:
            composite_equity, composite_dates = wfo_service.extract_composite_curve(
                windows,
                lambda oos_start: repo.find_oos_equity_curve_json(
                    strategy_id, oos_start
                ),
            )
        except Exception as e:  # noqa: BLE001
            # CWE-117 対策: ユーザー入力 strategy_id は CR/LF を除去してからログに出す
            logger.warning(
                "composite curve 生成に失敗: %s (%s)",
                sanitize_for_log(strategy_id),
                e,
            )
            composite_equity, composite_dates = [], []

    except AlphaVisualizerError:
        raise
    except Exception as e:
        # CWE-117 対策: ユーザー入力 strategy_id は CR/LF を除去してからログに出す
        logger.warning(
            "WFO 取得に失敗: %s (%s)",
            sanitize_for_log(strategy_id),
            e,
        )
        raise NotFoundError(
            f"WFO 結果の取得に失敗しました: {strategy_id}"
        ) from e

    return {
        "strategy_id": strategy_id,
        "strategy_name": _resolve_strategy_name(strategies_repo, strategy_id),
        "symbol": symbol,
        "metric_name": metric_name,
        "windows": windows,
        "composite_equity": composite_equity,
        "composite_dates": composite_dates,
    }
