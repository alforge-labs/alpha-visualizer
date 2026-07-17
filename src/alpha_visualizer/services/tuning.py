"""チューニングループ用の一時戦略ファイル生成（GUI化 Wave C, #293）。

戦略定義の ``parameters`` だけを GUI の編集値で差し替えた一時 JSON を作る。
strategy_id を含む他のフィールドは一切変更しないため、``backtest run
--strategy-file`` で実行しても元戦略の実行履歴に通常ランとして記録される。

スキーマ検証は forge 側（StrategyDefinition / strategy save の Pydantic）が
SSoT。ここでは「存在するパラメータ名か」「スカラー値か」の境界チェックのみ
行い、それ以外の妥当性は forge CLI のエラーをそのまま表面化させる。
"""
from __future__ import annotations

import json
import pathlib
import uuid
from typing import Any

from alpha_visualizer.errors import InvalidRequestError

# GUI から受け付けるパラメータ値の型（ネスト構造の注入は拒否する）
_SCALAR_TYPES = (str, int, float, bool)


def build_override_file(
    raw_definition: str,
    parameters: dict[str, Any],
    dest_dir: pathlib.Path,
) -> pathlib.Path:
    """``parameters`` を差し替えた一時戦略 JSON を ``dest_dir`` に書き出す。

    Args:
        raw_definition: 戦略定義の JSON 文字列（``StrategyRow.raw_definition``）。
        parameters: 上書きするパラメータ（部分指定可。既存キーのみ許可）。
        dest_dir: 書き出し先ディレクトリ（存在すること）。

    Returns:
        生成した一時ファイルのパス。

    Raises:
        InvalidRequestError: 定義が JSON として壊れている・未知のパラメータ名・
            スカラー以外の値・空の上書き指定。
    """
    if not parameters:
        raise InvalidRequestError(
            "上書きするパラメータが指定されていません / No parameters to override",
        )

    try:
        definition = json.loads(raw_definition)
    except (json.JSONDecodeError, TypeError) as exc:
        raise InvalidRequestError(
            "戦略定義の JSON が壊れています / Strategy definition is not valid JSON",
        ) from exc
    if not isinstance(definition, dict):
        raise InvalidRequestError(
            "戦略定義の JSON が壊れています / Strategy definition is not valid JSON",
        )

    current = definition.get("parameters")
    if not isinstance(current, dict):
        current = {}

    for key, value in parameters.items():
        if key not in current:
            raise InvalidRequestError(
                f"未知のパラメータです: {key} / Unknown parameter: {key}",
            )
        # 値の型整合（int と float の違い等）は forge 側の Pydantic 検証が SSoT。
        # ここではネスト構造の注入だけを弾く。
        if not isinstance(value, _SCALAR_TYPES):
            raise InvalidRequestError(
                f"パラメータ値はスカラーのみ許可されます: {key}"
                f" / Parameter value must be a scalar: {key}",
            )

    merged = {**current, **parameters}
    new_definition = {**definition, "parameters": merged}

    dest = dest_dir / f"tune-{uuid.uuid4().hex[:12]}.json"
    dest.write_text(
        json.dumps(new_definition, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return dest
