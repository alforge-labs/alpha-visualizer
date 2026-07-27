"""`/api/maintenance` のリクエスト・レスポンススキーマ。

孤児の一覧・削除はいずれも forge CLI（`backtest prune-orphans`）に委譲する。
visualizer 側で孤児を算出しない理由は設計仕様 §4.2 を参照。
"""

from __future__ import annotations

from pydantic import BaseModel


class OrphanRunItem(BaseModel):
    """孤児 1 件。forge CLI の `--json` の `orphans[]` と 1:1 で対応する。"""

    strategy_id: str
    backtest_run_count: int
    optimization_run_count: int
    #: JSON 列のバイト長合計（概算）。SQLite の実占有量ではない
    bytes: int
    first_run_at: str | None = None
    last_run_at: str | None = None


class OrphanRunsResponse(BaseModel):
    orphans: list[OrphanRunItem]
    count: int
    total_bytes: int


class PruneOrphansRequest(BaseModel):
    #: 削除する strategy_id。空配列はスキーマでは弾かない。
    #: CLI は --strategy 省略時に全孤児を削除するため、空配列の拒否は
    #: ルーター側で明示的に 400 を返す（422 だと「選択 0 件」と
    #: 「フィールド未指定」の区別が API 利用側に伝わりにくいため）。
    strategy_ids: list[str]


class PruneOrphansResponse(BaseModel):
    deleted_strategy_ids: list[str]
    deleted_backtest_rows: int
    deleted_optimization_rows: int
    #: VACUUM で回収したバイト数。VACUUM 失敗時は 0
    reclaimed_bytes: int
    #: VACUUM が失敗したときのメッセージ。成功なら None
    vacuum_error: str | None = None
