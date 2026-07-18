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
import os
import pathlib
import uuid
from typing import Any

from alpha_visualizer.errors import InvalidRequestError

# GUI から受け付けるパラメータ値の型（ネスト構造の注入は拒否する）
_SCALAR_TYPES = (str, int, float, bool)


def _parse_definition(raw_definition: str) -> dict[str, Any]:
    """戦略定義 JSON 文字列を dict にパースする（壊れていれば 400）。"""
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
    return definition


def _write_private_json(
    definition: dict[str, Any], dest_dir: pathlib.Path, prefix: str
) -> pathlib.Path:
    """定義 dict を owner-only の一時 JSON として書き出す。

    共有 /tmp に書くため owner-only（0600）+ O_EXCL で作成する:
    他ユーザーから戦略パラメータ（非公開資産）を読めなくする（CWE-377 対策）
    """
    dest = dest_dir / f"{prefix}-{uuid.uuid4().hex[:12]}.json"
    fd = os.open(dest, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(definition, ensure_ascii=False, indent=2))
    return dest


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

    definition = _parse_definition(raw_definition)

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
    return _write_private_json(new_definition, dest_dir, prefix="tune")


def build_duplicate_file(
    raw_definition: str,
    new_strategy_id: str,
    dest_dir: pathlib.Path,
) -> pathlib.Path:
    """``strategy_id`` を差し替えた複製用の一時戦略 JSON を書き出す（vis#301）。

    strategy_id 以外のフィールド（name / parameters / indicators 等）は
    元定義をそのまま保持する。登録は ``forge strategy save``（--force なし）
    へ委譲され、ID 衝突は forge 側で拒否される。

    Raises:
        InvalidRequestError: 定義が JSON として壊れている。
    """
    definition = _parse_definition(raw_definition)
    new_definition = {**definition, "strategy_id": new_strategy_id}
    return _write_private_json(new_definition, dest_dir, prefix="dup")
