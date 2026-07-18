"""戦略 API ルーター

`/api/strategies`、`/api/strategies/compare`、`/api/strategies/{strategy_id}` を提供する。
戦略定義の取得元（DB / JSON）は ``StrategiesRepository`` が吸収する。
"""
from __future__ import annotations

import json
import logging
import math
import pathlib
import subprocess
import tempfile
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from alpha_visualizer.dependencies import (
    get_backtest_results_repo,
    get_forge_config_dep,
    get_optimization_repo,
    get_strategies_repo,
)
from alpha_visualizer.errors import (
    ConflictError,
    ExternalProcessError,
    InvalidRequestError,
    NotFoundError,
)
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import (
    BacktestResultRow,
    BacktestResultsRepository,
)
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.repositories.strategies import (
    StrategiesRepository,
    StrategyRow,
)
from alpha_visualizer.schemas.strategies import (
    StrategyComparison,
    StrategyDetail,
    StrategySummary,
)
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    build_forge_env,
    mask_home,
    resolve_forge_exe,
)
from alpha_visualizer.services.tuning import build_duplicate_file, build_override_file

logger = logging.getLogger(__name__)

router = APIRouter()


# --- ヘルパ -----------------------------------------------------------------


def _latest_summary(
    bt_repo: BacktestResultsRepository,
    forge_db_exists: bool,
    strategy_id: str,
) -> BacktestResultRow | None:
    """指定 strategy_id の最新バックテスト結果を返す。

    ``list_results`` は ``run_at`` 降順で返るため先頭が最新。
    backtest_results.db ファイルが存在しない場合は ``None``。
    """
    if not forge_db_exists:
        return None
    rows = bt_repo.list_results(strategy_id=strategy_id)
    return rows[0] if rows else None


def _parsed_definition(strategy: StrategyRow) -> dict[str, Any]:
    """``raw_definition`` を ``dict`` にパースする（失敗時は空辞書）。"""
    raw = strategy.raw_definition
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _strategy_to_summary(
    strategy: StrategyRow, latest: BacktestResultRow | None
) -> dict[str, Any]:
    """``/api/strategies`` 1 件分の dict を生成する。"""
    entry: dict[str, Any] = {
        "strategy_id": strategy.strategy_id,
        "name": strategy.name,
        "symbol": None,
        "timeframe": strategy.timeframe,
        "tags": list(strategy.tags),
        "target_symbols": list(strategy.target_symbols),
        "latest_sharpe": None,
        "latest_return_pct": None,
        "latest_max_drawdown_pct": None,
        "latest_profit_factor": None,
        "latest_win_rate_pct": None,
        "latest_total_trades": None,
        "last_run_at": None,
        "latest_source": None,
    }
    if latest is not None:
        entry["symbol"] = latest.symbol
        entry["latest_sharpe"] = latest.sharpe_ratio
        entry["latest_return_pct"] = latest.total_return_pct
        entry["latest_max_drawdown_pct"] = latest.max_drawdown_pct
        entry["latest_profit_factor"] = latest.profit_factor
        entry["latest_win_rate_pct"] = latest.win_rate_pct
        entry["latest_total_trades"] = latest.total_trades
        entry["last_run_at"] = latest.run_at
        entry["latest_source"] = latest.source
    return entry


def _shape_equity_curve(raw_json: str | None) -> tuple[list[str], list[float]]:
    """``equity_curve_json`` を解析して ``(dates, values)`` を返す。"""
    if not raw_json:
        return [], []
    try:
        raw = json.loads(raw_json)
    except (TypeError, ValueError):
        return [], []
    if not isinstance(raw, list) or not raw:
        return [], []
    dates: list[str] = []
    values: list[float] = []
    for item in raw:
        if isinstance(item, dict):
            try:
                values.append(float(item.get("value", 0.0)))
                dates.append(str(item.get("date", "")))
            except (TypeError, ValueError):
                continue
        else:
            try:
                values.append(float(item))
                dates.append("")
            except (TypeError, ValueError):
                continue
    return dates, values


def _compute_daily_returns_pct(values: list[float]) -> list[float]:
    """equity values から日次リターン (%) を計算する。"""
    if len(values) < 2:
        return []
    out: list[float] = []
    for i in range(1, len(values)):
        prev = values[i - 1]
        curr = values[i]
        if prev == 0.0 or not math.isfinite(prev) or not math.isfinite(curr):
            out.append(0.0)
        else:
            out.append(round((curr - prev) / prev * 100.0, 6))
    return out


def _list_all_results_summary(
    bt_repo: BacktestResultsRepository,
    forge_db_exists: bool,
    strategy_id: str,
) -> list[dict[str, Any]]:
    """``/api/strategies/{id}`` の results 配列を生成する（run_at 降順）。"""
    if not forge_db_exists:
        return []
    rows = bt_repo.list_results(strategy_id=strategy_id)
    return [
        {
            "run_id": r.run_id,
            "symbol": r.symbol,
            "sharpe": r.sharpe_ratio,
            "return_pct": r.total_return_pct,
            "max_drawdown_pct": r.max_drawdown_pct,
            "total_trades": r.total_trades,
            "run_at": r.run_at,
            "source": r.source,
        }
        for r in rows
    ]


def _list_optimization_history(
    opt_repo: OptimizationRepository,
    forge_db_exists: bool,
    strategy_id: str,
) -> list[dict[str, Any]]:
    """optimization_runs から strategy_id 別の試行履歴を返す（時系列）。

    Repository は ``run_at`` 昇順で返すため、そのまま 1 始まりの
    ``trial`` 連番を付与してレスポンス形式に整える。
    """
    if not forge_db_exists:
        return []
    summaries = opt_repo.list_history_summary(strategy_id)
    return [
        {
            "trial": i,
            "best_sharpe": s.best_metric_value,
            "run_at": s.run_at,
            "n_trials": s.n_trials,
        }
        for i, s in enumerate(summaries, start=1)
    ]


# --- エンドポイント ---------------------------------------------------------


@router.get("/strategies", response_model=list[StrategySummary])
async def list_strategies(
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
    bt_repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
) -> list[dict[str, Any]]:
    strategies = list(strategies_repo.list_strategies())
    forge_db_exists = config.forge_db.exists()
    # N+1 を避けるため最新行を 1 クエリでまとめて取得し dict ルックアップする
    latest_map: dict[str, BacktestResultRow] = (
        bt_repo.find_latest_by_strategy_ids([s.strategy_id for s in strategies])
        if forge_db_exists
        else {}
    )
    return [
        _strategy_to_summary(s, latest_map.get(s.strategy_id))
        for s in strategies
    ]


@router.get("/strategies/compare", response_model=list[StrategyComparison])
async def compare_strategies(
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
    bt_repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
    ids: str = Query(..., description="カンマ区切りの strategy_id"),
) -> list[dict[str, Any]]:
    parsed = [s for s in (i.strip() for i in ids.split(",")) if s]
    if not parsed:
        raise InvalidRequestError("ids が空です")

    forge_db_exists = config.forge_db.exists()
    # 戦略定義と最新バックテスト結果をそれぞれ 1 クエリで取得し dict 化する
    strategy_map: dict[str, StrategyRow] = {
        s.strategy_id: s for s in strategies_repo.find_by_ids(parsed)
    }
    latest_map: dict[str, BacktestResultRow] = (
        bt_repo.find_latest_by_strategy_ids(parsed) if forge_db_exists else {}
    )

    out: list[dict[str, Any]] = []
    for idx, sid in enumerate(parsed):
        latest = latest_map.get(sid)
        if latest is None:
            continue
        strategy = strategy_map.get(sid)
        name = strategy.name if strategy is not None else sid
        dates, values = _shape_equity_curve(latest.equity_curve_json)
        daily_returns = _compute_daily_returns_pct(values)
        out.append(
            {
                "id": sid,
                "name": name,
                "symbol": latest.symbol or "",
                "total_return_pct": float(latest.total_return_pct or 0.0),
                "cagr_pct": float(latest.cagr_pct or 0.0),
                "sharpe_ratio": float(latest.sharpe_ratio or 0.0),
                "sortino_ratio": float(latest.sortino_ratio or 0.0),
                "max_drawdown_pct": float(latest.max_drawdown_pct or 0.0),
                "win_rate_pct": float(latest.win_rate_pct or 0.0),
                "profit_factor": float(latest.profit_factor or 0.0),
                "total_trades": int(latest.total_trades or 0),
                "is_baseline": idx == 0,
                "equity": {"dates": dates, "values": values},
                "daily_returns": daily_returns,
            }
        )
    if not out:
        raise NotFoundError(
            f"指定した戦略のバックテスト結果が見つかりません: {parsed}",
        )
    return out


@router.get("/strategies/{strategy_id}", response_model=StrategyDetail)
async def get_strategy(
    strategy_id: str,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
    bt_repo: Annotated[BacktestResultsRepository, Depends(get_backtest_results_repo)],
    opt_repo: Annotated[OptimizationRepository, Depends(get_optimization_repo)],
) -> dict[str, Any]:
    strategy = strategies_repo.get_strategy(strategy_id)
    if strategy is None:
        raise NotFoundError(f"strategy_id '{strategy_id}' が見つかりません")

    definition = _parsed_definition(strategy)
    forge_db_exists = config.forge_db.exists()
    return {
        "strategy_id": strategy.strategy_id,
        "name": strategy.name,
        "parameters": definition.get("parameters", {}),
        "indicators": definition.get("indicators", []),
        "variables": definition.get("variables", []),
        "entry_conditions": definition.get("entry_conditions"),
        "exit_conditions": definition.get("exit_conditions"),
        "risk_management": definition.get("risk_management"),
        "regime_config": definition.get("regime_config"),
        "results": _list_all_results_summary(bt_repo, forge_db_exists, strategy_id),
        "optimization_history": _list_optimization_history(
            opt_repo, forge_db_exists, strategy_id
        ),
    }


# ---- パラメータ保存（チューニングループの書き戻し, #293） ------------------- #

# strategy save は軽量な登録処理なので短いタイムアウトで足りる
STRATEGY_SAVE_TIMEOUT_SEC = 60
SAVE_LOG_TAIL_MAX_LINES = 20


class SaveParametersRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # 値の検証（既存キーのみ・スカラーのみ）は build_override_file が行う
    parameters: dict[str, Any] = Field(min_length=1, max_length=100)


class SaveParametersResponse(BaseModel):
    status: str
    parameters: dict[str, Any]
    log_tail: str | None = None


@router.post(
    "/strategies/{strategy_id}/parameters", response_model=SaveParametersResponse
)
def save_strategy_parameters(
    strategy_id: str,
    body: SaveParametersRequest,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
) -> SaveParametersResponse:
    """編集済みパラメータを戦略定義へ書き戻す（destructive・UI 側で確認必須）。

    visualizer はファイル・DB を直接書かず、パラメータ差し替え済みの一時
    JSON を ``forge strategy save --force`` に渡して登録を委譲する
    （single-writer 維持。スキーマ検証は forge 側 Pydantic が SSoT で、
    エラーはそのまま表面化させる）。
    """
    strategy = strategies_repo.get_strategy(strategy_id)
    if strategy is None:
        raise NotFoundError(f"strategy_id '{strategy_id}' が見つかりません")

    # 入力検証（400）を forge 解決（500）より先に行う: 不正入力の診断が
    # forge の有無に左右されないようにするため。
    override_path = build_override_file(
        strategy.raw_definition,
        body.parameters,
        pathlib.Path(tempfile.gettempdir()),
    )
    try:
        forge_exe = resolve_forge_exe()
        if forge_exe is None:
            raise ExternalProcessError(FORGE_NOT_FOUND_MESSAGE)
        merged: dict[str, Any] = json.loads(
            override_path.read_text(encoding="utf-8")
        ).get("parameters", {})
        proc = subprocess.run(
            [forge_exe, "strategy", "save", str(override_path), "--force"],
            capture_output=True,
            text=True,
            env=build_forge_env(config),
            timeout=STRATEGY_SAVE_TIMEOUT_SEC,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as exc:
        raise ExternalProcessError(
            f"戦略の保存が {STRATEGY_SAVE_TIMEOUT_SEC} 秒以内に完了しませんでした"
            f" / Strategy save did not finish within {STRATEGY_SAVE_TIMEOUT_SEC} seconds",
        ) from exc
    finally:
        try:
            override_path.unlink()
        except OSError:
            logger.debug("一時戦略ファイルの削除に失敗: %s", override_path)

    output = (proc.stderr or "") + ("\n" + proc.stdout if proc.stdout else "")
    tail_lines = output.strip().splitlines()[-SAVE_LOG_TAIL_MAX_LINES:]
    log_tail = mask_home("\n".join(tail_lines)) if tail_lines else None

    if proc.returncode != 0:
        raise ExternalProcessError(
            log_tail or "戦略の保存に失敗しました / Strategy save failed",
        )

    return SaveParametersResponse(status="ok", parameters=merged, log_tail=log_tail)


class DuplicateStrategyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # 戦略 ID はファイル名にもなるため、パス区切りや先頭ドットを含む値を
    # スキーマ検証で拒否する（パストラバーサル防止も兼ねる）
    new_strategy_id: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$",
    )


class DuplicateStrategyResponse(BaseModel):
    status: str
    strategy_id: str
    log_tail: str | None = None


@router.post(
    "/strategies/{strategy_id}/duplicate", response_model=DuplicateStrategyResponse
)
def duplicate_strategy(
    strategy_id: str,
    body: DuplicateStrategyRequest,
    config: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
) -> DuplicateStrategyResponse:
    """既存戦略を別 ID で複製して新規登録する（vis#301・複製ベースの新規作成）。

    visualizer はファイル・DB を直接書かず、strategy_id を差し替えた一時 JSON を
    ``forge strategy save``（--force **なし**）へ委譲する（single-writer 維持）。
    --force を付けないため ID 衝突は forge 側でも拒否され、既存戦略は
    上書きされない。事前チェックで既知の衝突は 409 で返す（レース時は forge の
    拒否が 500 として表面化する）。
    """
    source = strategies_repo.get_strategy(strategy_id)
    if source is None:
        raise NotFoundError(f"strategy_id '{strategy_id}' が見つかりません")
    if strategies_repo.get_strategy(body.new_strategy_id) is not None:
        raise ConflictError(
            f"strategy_id '{body.new_strategy_id}' は既に存在します"
            f" / strategy_id '{body.new_strategy_id}' already exists",
        )

    duplicate_path = build_duplicate_file(
        source.raw_definition,
        body.new_strategy_id,
        pathlib.Path(tempfile.gettempdir()),
    )
    try:
        forge_exe = resolve_forge_exe()
        if forge_exe is None:
            raise ExternalProcessError(FORGE_NOT_FOUND_MESSAGE)
        proc = subprocess.run(
            [forge_exe, "strategy", "save", str(duplicate_path)],
            capture_output=True,
            text=True,
            env=build_forge_env(config),
            timeout=STRATEGY_SAVE_TIMEOUT_SEC,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as exc:
        raise ExternalProcessError(
            f"戦略の複製が {STRATEGY_SAVE_TIMEOUT_SEC} 秒以内に完了しませんでした"
            f" / Strategy duplication did not finish within"
            f" {STRATEGY_SAVE_TIMEOUT_SEC} seconds",
        ) from exc
    finally:
        try:
            duplicate_path.unlink()
        except OSError:
            logger.debug("一時戦略ファイルの削除に失敗: %s", duplicate_path)

    output = (proc.stderr or "") + ("\n" + proc.stdout if proc.stdout else "")
    tail_lines = output.strip().splitlines()[-SAVE_LOG_TAIL_MAX_LINES:]
    log_tail = mask_home("\n".join(tail_lines)) if tail_lines else None

    if proc.returncode != 0:
        raise ExternalProcessError(
            log_tail or "戦略の複製に失敗しました / Strategy duplication failed",
        )

    return DuplicateStrategyResponse(
        status="ok", strategy_id=body.new_strategy_id, log_tail=log_tail
    )
