"""FastAPI の Depends で使う DI ヘルパ。

`app.state` に格納された ForgeConfig / Engine 等を、ルーターから
``Depends(...)`` 経由で受け取るための薄いラッパーを提供する。
"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy import Engine

from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository


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
