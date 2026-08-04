"""Pine Script 生成 API ルーター（issue #487）。

``POST /api/pine/{strategy_id}`` を提供する。`alpha-forge pine preview
--strategy <id>` に委譲し、stdout の Pine v6 本文をそのまま返す。

`pine generate`（ファイル書き出し）ではなく `pine preview` を使う理由:
出力先（forge.yaml の ``pinescript.output_path``）の解釈を visualizer に
持ち込まないため（設定解釈を複製すると別置き yaml 運用でずれる）。
ダウンロード用のファイル化はフロントエンドが Blob で行う。

Pine 出力は有料プラン限定の機能実行のため、非 loopback 公開中は
データジョブ（#485）と同じ local_write ガードで 403 を返す。
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.errors import LocalWriteDisabledError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.routers.data import LOCAL_WRITE_DISABLED_MESSAGE
from alpha_visualizer.schemas.pine import PineScriptResponse
from alpha_visualizer.services.forge_sync import run_forge_capture

logger = logging.getLogger(__name__)

router = APIRouter()

#: Pine 生成は Jinja2 テンプレートレンダリングで軽量だが、forge の起動コスト
#: と HMM 埋め込み等の将来拡張を見込んで一覧系と同じ余裕を取る。
GENERATE_TIMEOUT_SEC = 60

#: forge argv への素通しを境界で塞ぐ（routers/jobs.py の strategy_id と同じ規約）
STRATEGY_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]*$"


@router.post("/pine/{strategy_id}", response_model=PineScriptResponse)
def generate_pine(
    request: Request,
    strategy_id: Annotated[str, Path(pattern=STRATEGY_ID_PATTERN)],
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> PineScriptResponse:
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)

    script = run_forge_capture(
        ["pine", "preview", "--strategy", strategy_id],
        forge_cfg,
        GENERATE_TIMEOUT_SEC,
    )
    return PineScriptResponse(
        strategy_id=strategy_id,
        filename=f"{strategy_id}.pine",
        script=script,
    )
