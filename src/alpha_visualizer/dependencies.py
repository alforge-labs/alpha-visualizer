"""FastAPI の Depends で使う DI ヘルパ。

`app.state` に格納された ForgeConfig / Engine 等を、ルーターから
``Depends(...)`` 経由で受け取るための薄いラッパーを提供する。
"""
from __future__ import annotations

import threading

from fastapi import Request
from sqlalchemy import Engine

from alpha_visualizer.db import get_engine
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.backtest_results import BacktestResultsRepository
from alpha_visualizer.repositories.ideas import IdeasReader
from alpha_visualizer.repositories.live import LiveDataRepository
from alpha_visualizer.repositories.optimization import OptimizationRepository
from alpha_visualizer.repositories.strategies import StrategiesRepository
from alpha_visualizer.services.jobs import JobManager

# Engine の遅延生成を直列化するプロセス全体のロック (issue #354)。
# 同期エンドポイントはスレッドプールで並行実行されるため、二重生成を防ぐ。
_engine_init_lock = threading.Lock()


def get_forge_config_dep(request: Request) -> ForgeConfig:
    """``app.state.forge_config`` を返す。"""
    return request.app.state.forge_config


def _resolve_engine(request: Request) -> Engine | None:
    """``app.state.engine`` を返す。起動後に DB が現れた場合は遅延生成する。

    ``create_app`` は backtest_results.db 不在時に Engine を ``None`` にする
    （不在ファイルの自動 touch 防止・issue #173）。その後 GUI からの初回
    バックテストで forge が DB を新規生成すると、起動時スナップショットの
    ままでは全 DB 系 API が 500 になる（issue #354）。ここで存在を再確認して
    生成することで、再起動なしに結果を閲覧できるようにする。
    """
    engine = request.app.state.engine
    if engine is not None:
        return engine
    cfg: ForgeConfig = request.app.state.forge_config
    if not cfg.forge_db.exists():
        return None
    with _engine_init_lock:
        if request.app.state.engine is None:
            request.app.state.engine = get_engine(cfg.forge_db)
    return request.app.state.engine


def _resolve_strategies_engine(request: Request) -> Engine | None:
    """``app.state.strategies_engine`` を返す。起動後に DB が現れた場合は遅延生成する。

    DB モード（``strategies_db`` 設定あり）で strategies.db が起動後に
    生成されたケースへの対応。JSON モード（``strategies_db=None``）では常に None。
    """
    engine = request.app.state.strategies_engine
    if engine is not None:
        return engine
    cfg: ForgeConfig = request.app.state.forge_config
    if cfg.strategies_db is None or not cfg.strategies_db.exists():
        return None
    with _engine_init_lock:
        if request.app.state.strategies_engine is None:
            request.app.state.strategies_engine = get_engine(cfg.strategies_db)
    return request.app.state.strategies_engine


def get_engine_dep(request: Request) -> Engine | None:
    """共有 Engine を返す。

    Engine は ``create_app`` で生成（または初回アクセス時に遅延生成）され、
    Repository が SQL クエリを発行する際の入口として共有する。

    backtest_results.db が存在しない場合は ``None``（issue #173）。各 router は
    クエリ発行前に ``config.forge_db.exists()`` で 404 ガードする前提。
    """
    return _resolve_engine(request)


def get_backtest_results_repo(request: Request) -> BacktestResultsRepository:
    """``BacktestResultsRepository`` を共有 Engine から構築して返す。"""
    return BacktestResultsRepository(_resolve_engine(request))


def get_strategies_repo(request: Request) -> StrategiesRepository:
    """``StrategiesRepository`` を ForgeConfig + 共有 Engine から構築。

    DB モード（``strategies_db`` 指定）と JSON モード（``strategies_dir``）の
    両方を Repository が内部で吸収する。Engine は ``create_app`` で 1 度だけ
    生成され ``app.state.strategies_engine`` にキャッシュされたものを利用する。
    """
    cfg: ForgeConfig = request.app.state.forge_config
    return StrategiesRepository(
        strategies_db_engine=_resolve_strategies_engine(request),
        strategies_dir=cfg.strategies_dir,
        # 設定上の strategies.db パス（不在でも非 None = DB モード）を渡す。
        # DB モードなのにファイルが無いとき、stale な JSON へ黙って落ちず Fail Loud。
        strategies_db=cfg.strategies_db,
    )


def get_optimization_repo(request: Request) -> OptimizationRepository:
    """``OptimizationRepository`` を共有 Engine から構築して返す。"""
    return OptimizationRepository(_resolve_engine(request))


def get_job_manager(request: Request) -> JobManager:
    """``app.state.job_manager``（非同期ジョブ基盤）を返す。"""
    return request.app.state.job_manager


def get_live_repo(request: Request) -> LiveDataRepository:
    """``LiveDataRepository`` を ``app.state.engine`` から構築して返す。

    live 実績（live_summaries / live_trades / live_position_summaries）は
    ``backtest_results.db`` 内のテーブルに永続化されるため、共有 Engine だけで
    構築できる（issue #209 で JSON ファイル経路を廃止）。
    """
    return LiveDataRepository(_resolve_engine(request))


def get_ideas_reader(request: Request) -> IdeasReader:
    """``IdeasReader`` を ``ForgeConfig.ideas_json`` から構築して返す。"""
    cfg: ForgeConfig = request.app.state.forge_config
    return IdeasReader(cfg.ideas_json)
