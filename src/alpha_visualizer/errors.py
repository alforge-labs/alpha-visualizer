"""alpha-visualizer ドメイン例外階層。

Router 層は ``HTTPException`` を直接 raise する代わりに、本モジュールの
例外を raise する。``app.py`` で登録される ``exception_handler`` が
``JSONResponse`` に変換し、``{"detail": "..."}`` を生成する。

新しい例外型を追加するときは ``AlphaVisualizerError`` を継承して
``status_code`` を付ければよい（既存ハンドラは修正不要）。
"""
from __future__ import annotations


class AlphaVisualizerError(Exception):
    """ドメイン例外の基底クラス。"""

    status_code: int = 500


class NotFoundError(AlphaVisualizerError):
    """要求されたリソースが見つからない。"""

    status_code = 404


class InvalidRequestError(AlphaVisualizerError):
    """リクエスト形式・パラメータが不正。"""

    status_code = 400


class ExternalProcessError(AlphaVisualizerError):
    """外部プロセス（forge コマンド等）の実行失敗。"""

    status_code = 500


class DataCorruptError(AlphaVisualizerError):
    """データソースが存在するが内容が破損・不整合。"""

    status_code = 500


class DataSourceUnavailableError(AlphaVisualizerError):
    """設定上は使うはずのデータソースが利用できない（不在・未生成など）。

    例: ``strategies.use_db: true`` なのに ``strategies.db`` が存在しない。
    黙って別ソース（stale な JSON 等）へフォールバックせず、設定と実体の
    不一致を明示するために使う（Fail Loud）。
    """

    status_code = 500


class TooManyJobsError(AlphaVisualizerError):
    """アクティブなジョブ数が上限に達している（流量ガード）。"""

    status_code = 429
