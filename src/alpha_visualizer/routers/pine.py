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

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from alpha_visualizer.dependencies import get_forge_config_dep, get_strategies_repo
from alpha_visualizer.errors import LocalWriteDisabledError, NotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.repositories.strategies import StrategiesRepository
from alpha_visualizer.routers.data import LOCAL_WRITE_DISABLED_MESSAGE
from alpha_visualizer.schemas.pine import (
    PineIndicatorSupport,
    PineScriptResponse,
    PineSupportResponse,
)
from alpha_visualizer.services.forge_sync import run_forge_capture, run_forge_json

logger = logging.getLogger(__name__)

router = APIRouter()

#: Pine 生成は Jinja2 テンプレートレンダリングで軽量だが、forge の起動コスト
#: と HMM 埋め込み等の将来拡張を見込んで一覧系と同じ余裕を取る。
GENERATE_TIMEOUT_SEC = 60
SUPPORT_TIMEOUT_SEC = 60

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


@router.get("/pine/{strategy_id}/support", response_model=PineSupportResponse)
def pine_support(
    strategy_id: Annotated[str, Path(pattern=STRATEGY_ID_PATTERN)],
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
    strategies_repo: Annotated[StrategiesRepository, Depends(get_strategies_repo)],
) -> PineSupportResponse:
    """生成前の非対応指標チェック（issue #488）。

    対応表は `analyze indicator list --json` に委譲する（SSoT は forge。
    visualizer に対応指標をハードコードすると forge 側の追加・変更とずれる）。
    対応表に無い指標型は「非対応」として警告に倒す — 判定できないものを
    「対応」と見せると TradingView へ持ち出してから動かない事故になる。
    参照専用のため local_write ガードは掛けない。
    """
    row = strategies_repo.get_strategy(strategy_id)
    if row is None:
        raise NotFoundError(
            f"戦略が見つかりません / Strategy not found: {strategy_id}"
        )
    try:
        definition = json.loads(row.raw_definition or "{}")
    except json.JSONDecodeError:
        definition = {}
    raw_indicators = definition.get("indicators") or []

    payload = run_forge_json(
        ["analyze", "indicator", "list", "--json"], forge_cfg, SUPPORT_TIMEOUT_SEC
    )
    supported_map = {
        str(item.get("name", "")).upper(): bool(item.get("pine_supported"))
        for item in payload.get("indicators", [])
        if isinstance(item, dict)
    }

    indicators: list[PineIndicatorSupport] = []
    unsupported_types: set[str] = set()
    for ind in raw_indicators:
        if not isinstance(ind, dict):
            continue
        ind_type = str(ind.get("type", ""))
        supported = supported_map.get(ind_type.upper(), False)
        indicators.append(
            PineIndicatorSupport(
                id=str(ind.get("id", "")), type=ind_type, pine_supported=supported
            )
        )
        if not supported and ind_type:
            unsupported_types.add(ind_type)

    return PineSupportResponse(
        strategy_id=strategy_id,
        indicators=indicators,
        unsupported_types=sorted(unsupported_types),
        all_unsupported=len(indicators) > 0
        and all(not i.pine_supported for i in indicators),
    )
