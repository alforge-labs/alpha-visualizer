"""FastAPI の Depends で使う DI ヘルパ。

`app.state` に格納された ForgeConfig / Engine 等を、ルーターから
``Depends(...)`` 経由で受け取るための薄いラッパーを提供する。
"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy import Engine

from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository
from alpha_visualizer.repositories.ideas import IdeasReader
from alpha_visualizer.repositories.live import LiveDataRepository
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.repositories.strategies import StrategiesRepository


def get_forge_config_dep(request: Request) -> ForgeConfig:
    """``app.state.forge_config`` を返す。"""
    return request.app.state.forge_config


def get_engine_dep(request: Request) -> Engine | None:
    """``app.state.engine`` を返す。

    Engine は ``create_app`` で 1 度だけ生成されており、Repository が
    SQL クエリを発行する際の入口として共有する。

    backtest_results.db が存在しない場合は ``None``（issue #173）。各 router は
    クエリ発行前に ``config.forge_db.exists()`` で 404 ガードする前提。
    """
    return request.app.state.engine


def get_backtest_results_repo(request: Request) -> BacktestResultsRepository:
    """``BacktestResultsRepository`` を ``app.state.engine`` から構築して返す。"""
    return BacktestResultsRepository(request.app.state.engine)


def get_strategies_repo(request: Request) -> StrategiesRepository:
    """``StrategiesRepository`` を ForgeConfig + 共有 Engine から構築。

    DB モード（``strategies_db`` 指定）と JSON モード（``strategies_dir``）の
    両方を Repository が内部で吸収する。Engine は ``create_app`` で 1 度だけ
    生成され ``app.state.strategies_engine`` にキャッシュされたものを利用する。
    """
    cfg: ForgeConfig = request.app.state.forge_config
    return StrategiesRepository(
        strategies_db_engine=request.app.state.strategies_engine,
        strategies_dir=cfg.strategies_dir,
    )


def get_optimization_repo(request: Request) -> OptimizationRepository:
    """``OptimizationRepository`` を ``app.state.engine`` から構築して返す。"""
    return OptimizationRepository(request.app.state.engine)


def get_live_repo(request: Request) -> LiveDataRepository:
    """``LiveDataRepository`` を ``app.state.engine`` から構築して返す。

    live 実績（live_summaries / live_trades / live_position_summaries）は
    ``backtest_results.db`` 内のテーブルに永続化されるため、共有 Engine だけで
    構築できる（issue #209 で JSON ファイル経路を廃止）。
    """
    return LiveDataRepository(request.app.state.engine)


def get_ideas_reader(request: Request) -> IdeasReader:
    """``IdeasReader`` を ``ForgeConfig.ideas_json`` から構築して返す。"""
    cfg: ForgeConfig = request.app.state.forge_config
    return IdeasReader(cfg.ideas_json)
