"""FastAPI の Depends で使う DI ヘルパ。

`app.state` に格納された ForgeConfig / Engine 等を、ルーターから
``Depends(...)`` 経由で受け取るための薄いラッパーを提供する。
"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy import Engine

from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository
from alpha_visualizer.repositories.live import LiveDataRepository
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.repositories.strategies import StrategiesRepository


def get_forge_config_dep(request: Request) -> ForgeConfig:
    """``app.state.forge_config`` を返す。"""
    return request.app.state.forge_config


def get_engine_dep(request: Request) -> Engine:
    """``app.state.engine`` を返す。

    Engine は ``create_app`` で 1 度だけ生成されており、Repository が
    SQL クエリを発行する際の入口として共有する。
    """
    return request.app.state.engine


def get_backtest_results_repo(request: Request) -> BacktestResultsRepository:
    """``BacktestResultsRepository`` を ``app.state.engine`` から構築して返す。"""
    return BacktestResultsRepository(request.app.state.engine)


def get_strategies_repo(request: Request) -> StrategiesRepository:
    """``StrategiesRepository`` を ``ForgeConfig`` から構築して返す。

    DB モード（``strategies_db`` 指定）と JSON モード（``strategies_dir``）の
    両方を Repository が内部で吸収する。
    """
    cfg: ForgeConfig = request.app.state.forge_config
    return StrategiesRepository.from_paths(
        strategies_dir=cfg.strategies_dir,
        strategies_db=cfg.strategies_db,
    )


def get_optimization_repo(request: Request) -> OptimizationRepository:
    """``OptimizationRepository`` を ``app.state.engine`` から構築して返す。"""
    return OptimizationRepository(request.app.state.engine)


def get_live_repo(request: Request) -> LiveDataRepository:
    """``LiveDataRepository`` を ``ForgeConfig.live_dir`` から構築して返す。

    JSON ファイル群と ``backtest_results`` テーブルの両方にアクセスするため、
    ``app.state.engine`` も合わせて注入する。
    """
    cfg: ForgeConfig = request.app.state.forge_config
    return LiveDataRepository(
        request.app.state.engine,
        live_dir=cfg.live_dir,
    )
