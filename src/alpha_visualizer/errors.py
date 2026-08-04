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
    #: フロントエンドが言語別メッセージへ写像するための機械可読コード（任意）。
    #: 設定した例外はレスポンスに ``{"code": "..."}`` が追加される。
    code: str | None = None


class NotFoundError(AlphaVisualizerError):
    """要求されたリソースが見つからない。"""

    status_code = 404


class InvalidRequestError(AlphaVisualizerError):
    """リクエスト形式・パラメータが不正。"""

    status_code = 400


class ExternalProcessError(AlphaVisualizerError):
    """外部プロセス（forge コマンド等）の実行失敗。"""

    status_code = 500


class ForgeCliNotFoundError(AlphaVisualizerError):
    """forge CLI が PATH に見つからない（未導入は想定内の状態）。

    サーバー障害と区別できるよう 500 でなく 503 を返し、フロントエンドが
    言語別の案内を出せるよう安定した機械可読 code を持つ (issue #358)。
    """

    status_code = 503
    code = "forge_cli_not_found"


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


class ConflictError(AlphaVisualizerError):
    """既存リソースと衝突するリクエスト（例: 複製先 strategy_id が既に存在）。"""

    status_code = 409


class LocalWriteDisabledError(AlphaVisualizerError):
    """書き込み系のローカル限定機能が無効（非 loopback バインドで公開中）。

    データ取得（ネットワークアクセス + ファイル生成）や Pine 生成
    （ファイル生成）は、認証を持たない本 API を LAN 公開した際に
    エンドポイントごと拒否する（agent と同じ方針・issue #485）。
    """

    status_code = 403
    code = "local_write_disabled"


class AgentDisabledError(AlphaVisualizerError):
    """AI 戦略開発機能が無効（非 loopback バインドで公開中）。

    エージェント起動は任意コード実行に近い操作のため、LAN 公開時は
    エンドポイントごと拒否する（設計: specs/2026-08-02-agent-develop-design.md）。
    """

    status_code = 403
    code = "agent_disabled"


class AgentCliNotFoundError(AlphaVisualizerError):
    """エージェント CLI（claude / codex）が PATH に見つからない。

    forge 未導入（ForgeCliNotFoundError）と同じく想定内の状態なので
    503 + 機械可読 code で返し、フロントが導入案内を出せるようにする。
    """

    status_code = 503
    code = "agent_cli_not_found"
