"""ライブ実績 API ルーター。

`/api/live` (一覧) と `/api/live/{strategy_id}` (詳細) を提供する。
整形ロジックは ``services.live`` に集約してあり、本ルーターは Repository
アクセスと HTTP 変換、warnings 組み立てのみを担う。

ファイル構造:
- ``<live_dir>/summaries/<strategy_id>.live.summary.json``
- ``<live_dir>/trades/<strategy_id>.trades.json``
"""
from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from alpha_visualizer.dependencies import get_live_repo
from alpha_visualizer.errors import NotFoundError
from alpha_visualizer.repositories.live import LiveDataRepository
from alpha_visualizer.schemas.live import LiveDetail, LiveListItem
from alpha_visualizer.services import live as live_service

logger = logging.getLogger(__name__)

router = APIRouter()

# レスポンスでの trades 上限（フロントの初期表示用）
_MAX_TRADES = 200


def _load_live_summary(
    repo: LiveDataRepository, strategy_id: str
) -> dict[str, Any] | None:
    """live summary を辞書で取得し、``strategy_id`` キーを補完する。

    Repository が返す dict を直接 mutate せず、shallow copy 上で補完する。
    """
    raw = repo.load_summary(strategy_id)
    if raw is None:
        return None
    summary = dict(raw)
    if summary.get("strategy_id") in (None, ""):
        summary["strategy_id"] = strategy_id
    return summary


def _load_live_trades(
    repo: LiveDataRepository, strategy_id: str
) -> list[dict[str, Any]]:
    """live trades を正規化済みのリストで返す。"""
    out: list[dict[str, Any]] = []
    for item in repo.load_raw_trades(strategy_id):
        normalized = live_service.normalize_trade(item)
        if normalized is not None:
            out.append(normalized)
    return out


def _backtest_record_for_diff(
    repo: LiveDataRepository,
    strategy_id: str,
    run_id: str | None,
) -> dict[str, Any] | None:
    """``backtest_results`` から該当行を取り、必要に応じて trades_json をパースする。

    DB ファイル不在やテーブル無し等のエラーは ``None`` を返し、Router 側で
    warning を組み立てて 200 応答する（既存挙動の踏襲）。
    """
    try:
        row = repo.fetch_backtest_for_diff(strategy_id, run_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("backtest_results 取得失敗 (%r): %s", strategy_id, exc)
        return None
    if row is None:
        return None

    trades: list[dict[str, Any]] = []
    if row.trades_json:
        try:
            parsed = json.loads(row.trades_json)
            if isinstance(parsed, list):
                trades = [t for t in parsed if isinstance(t, dict)]
        except (json.JSONDecodeError, TypeError):
            trades = []

    return {
        "run_id": row.run_id,
        "strategy_id": row.strategy_id,
        "trades": trades,
    }


@router.get("/live", response_model=list[LiveListItem])
async def list_live(
    repo: Annotated[LiveDataRepository, Depends(get_live_repo)],
) -> list[dict[str, Any]]:
    """live summary が存在する戦略 ID 一覧を返す。

    フロントの「Live」タブ表示判定に使う。
    """
    items: list[dict[str, Any]] = []
    for sid in repo.list_summary_strategy_ids():
        items.append(
            {
                "strategy_id": sid,
                "has_summary": repo.has_summary(sid),
                "has_trades": repo.has_trades(sid),
            }
        )
    return items


@router.get("/live/{strategy_id}", response_model=LiveDetail)
async def get_live(
    strategy_id: str,
    repo: Annotated[LiveDataRepository, Depends(get_live_repo)],
    run_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """指定戦略の live summary + trades と、期間整合した backtest aligned/diff を返す。"""
    summary = _load_live_summary(repo, strategy_id)
    if summary is None:
        raise NotFoundError(
            f"strategy_id '{strategy_id}' の live summary が見つかりません",
        )

    trades = _load_live_trades(repo, strategy_id)
    period = live_service.trade_period(trades)
    warnings: list[str] = []

    backtest: dict[str, Any] | None = None
    diff: dict[str, Any] | None = None
    if period is None:
        warnings.append(
            "live trades が無いため backtest との期間整合 diff は計算できません"
        )
    else:
        record = _backtest_record_for_diff(repo, strategy_id, run_id)
        if record is None:
            warnings.append("対応する backtest run が見つかりません")
        else:
            aligned = live_service.aligned_aggregates(record["trades"], period)
            if aligned is None:
                warnings.append("対象期間に backtest trade が存在しません")
                backtest = {
                    "run_id": record["run_id"],
                    "period": period,
                    "aligned": None,
                }
            else:
                backtest = {
                    "run_id": record["run_id"],
                    "period": period,
                    "aligned": aligned,
                }
                diff = live_service.compute_diff(summary, aligned)

    return {
        "strategy_id": strategy_id,
        "live": {
            "summary": summary,
            "trades": trades[:_MAX_TRADES],
            "period": period,
        },
        "backtest": backtest,
        "diff": diff,
        "warnings": warnings,
    }


__all__ = ["router"]
