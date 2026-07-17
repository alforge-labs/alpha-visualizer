"""FastAPI アプリケーションファクトリ"""
from __future__ import annotations

import logging
import pathlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.requests import Request
from fastapi.responses import FileResponse, JSONResponse

from alpha_visualizer.db import get_engine
from alpha_visualizer.errors import AlphaVisualizerError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers import historical as historical_router
from alpha_visualizer.routers import ideas as ideas_router
from alpha_visualizer.routers import jobs as jobs_router
from alpha_visualizer.routers import live as live_router
from alpha_visualizer.routers import optimize as optimize_router
from alpha_visualizer.routers import results as results_router
from alpha_visualizer.routers import run as run_router
from alpha_visualizer.routers import strategies as strategies_router
from alpha_visualizer.routers import wfo as wfo_router
from alpha_visualizer.services.jobs import JobManager

logger = logging.getLogger(__name__)


def create_app(
    forge_dir: pathlib.Path | None = None,
    *,
    config: ForgeConfig | None = None,
) -> FastAPI:
    """FastAPI アプリを生成する。

    引数は次のいずれかを満たす必要がある:
    - ``config``: 解決済みの ``ForgeConfig`` を直接渡す（推奨）
    - ``forge_dir``: ディレクトリパスを渡し、内部で ``ForgeConfig.from_forge_dir`` を呼ぶ
      （後方互換）

    両方渡された場合は ``config`` が優先される。
    """
    if config is None:
        if forge_dir is None:
            raise ValueError("forge_dir または config のいずれかを指定してください")
        config = ForgeConfig.from_forge_dir(pathlib.Path(forge_dir))

    # 非同期ジョブ基盤（#292）。in-process 保持のため uvicorn 単一ワーカー前提。
    job_manager = JobManager(forge_config=config)

    @asynccontextmanager
    async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        # forge は start_new_session でセッション分離しているため、明示的に
        # 止めないと Ctrl+C でのサーバー終了時に孤児プロセスが残る。
        await job_manager.shutdown()

    app = FastAPI(
        title="alpha-visualizer",
        description="AlphaForge バックテスト結果の Web 可視化ツール",
        version="0.1.0",
        lifespan=_lifespan,
    )
    app.state.forge_config = config
    app.state.job_manager = job_manager

    # SQLAlchemy Engine は起動時に 1 度だけ生成し、Repository から共有する。
    # backtest_results.db が存在する場合のみ Engine を作る。これは
    # ``create_engine("sqlite:///...")`` が不在ファイルを自動 touch して
    # 0 byte の backtest_results.db が散らかるのを防ぐため (issue #173)。
    # 不在時は ``engine = None`` にし、各 router の
    # ``config.forge_db.exists()`` ガードで 404 を返す経路に揃える。
    # 注: CLI 用途（ephemeral プロセス）のため明示的な engine.dispose() は行わない。
    # 長命プロセスや uvicorn reload を伴う用途への転用時は lifespan で dispose() すること。
    if config.forge_db.exists():
        app.state.engine = get_engine(config.forge_db)
    else:
        logger.warning(
            "backtest_results.db が見つかりません: %s"
            "（空 DB として扱います。一覧 API は空配列を、個別取得 API は 404 を返します）",
            config.forge_db,
        )
        app.state.engine = None

    # strategies.db (DB モード) も 1 回だけ Engine を生成し state にキャッシュ。
    # JSON モード（strategies_db=None）では None。
    if config.strategies_db is not None and config.strategies_db.exists():
        app.state.strategies_engine = get_engine(config.strategies_db)
    else:
        app.state.strategies_engine = None
        if config.strategies_db is not None:
            # DB モード設定なのに strategies.db が無い。戦略 API は stale な JSON へ
            # 黙って落ちず Fail Loud（StrategiesRepository が明示エラーを返す）。
            # 起動自体は止めない（backtest 等の他 API は提供する）が、原因を残す。
            logger.warning(
                "strategies.use_db=true ですが strategies.db が見つかりません: %s"
                "（戦略 API は明示エラーを返します。forge で戦略を保存して DB を生成してください）",
                config.strategies_db,
            )

    @app.exception_handler(AlphaVisualizerError)
    async def _alpha_error_handler(
        request: Request, exc: AlphaVisualizerError
    ) -> JSONResponse:
        """ドメイン例外を JSON レスポンスに変換する。

        Chain of Responsibility: 新しい例外型を追加してもこのハンドラは変更不要。
        """
        # 5xx は運用監視で拾うため ERROR、4xx はクライアント側の問題として WARNING
        log_fn = logger.error if exc.status_code >= 500 else logger.warning
        log_fn(
            "ドメイン例外: %s (status=%s, path=%s)",
            type(exc).__name__,
            exc.status_code,
            request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code, content={"detail": str(exc)}
        )

    app.include_router(results_router.router, prefix="/api")
    app.include_router(strategies_router.router, prefix="/api")
    app.include_router(ideas_router.router, prefix="/api")
    app.include_router(wfo_router.router, prefix="/api")
    app.include_router(optimize_router.router, prefix="/api")
    app.include_router(run_router.router, prefix="/api")
    app.include_router(jobs_router.router, prefix="/api")
    app.include_router(live_router.router, prefix="/api")
    app.include_router(historical_router.router, prefix="/api")

    forge_dir_str = str(config.forge_dir)

    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok", "forge_dir": forge_dir_str})

    static_dir = pathlib.Path(__file__).parent / "static"
    if static_dir.exists():
        index_html = static_dir / "index.html"
        static_root = static_dir.resolve()

        # 起動時に static_dir 配下の実ファイルを列挙し、許可リスト (dict) を作る。
        # こうすることでリクエストハンドラ側はユーザー入力を直接パス構築に使わず、
        # 既知の (相対パス -> 絶対パス) マップを引くだけになる。
        # CWE-22 (Path Traversal) に対するもっとも明確な防御で、
        # CodeQL の py/path-injection に対しても sanitizer なしで安全。
        allowed_files: dict[str, pathlib.Path] = {}
        for child in static_root.rglob("*"):
            if not child.is_file():
                continue
            try:
                rel = child.relative_to(static_root).as_posix()
            except ValueError:
                # rglob 上はあり得ないが、シンボリックリンクで外に出るケースを除外
                continue
            allowed_files[rel] = child

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str) -> FileResponse:
            """SPA ルート対応: 起動時にスキャンした許可リストにあるファイルだけを
            配信し、それ以外（未知のルート・トラバーサル試行・ディレクトリ）は
            すべて index.html へフォールバックする。
            """
            target = allowed_files.get(full_path)
            if target is not None:
                return FileResponse(target)
            return FileResponse(index_html)
    else:
        # wheel への static/ 同梱漏れ（issue #225）や frontend 未ビルドの開発環境では
        # SPA を配信できない。無言でルート / が 404 になるのではなく、
        # 起動ログから原因と対処に到達できるよう warning を残す。
        logger.warning(
            "static/ が見つかりません: %s（SPA ダッシュボードは配信されず、ルート / は 404 を返します。"
            "開発環境では `cd frontend && pnpm run build` を実行してください）",
            static_dir,
        )

    return app
