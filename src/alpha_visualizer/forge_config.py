"""forge.yaml を読み取り、forge が生成するディレクトリ構造からパスを解決するデータクラス

forge.yaml の探索順序:
1. 引数 ``config_path`` が明示指定されていればそれ
2. ``<forge_dir>/forge.yaml``
3. 環境変数 ``FORGE_CONFIG`` が指すパス（存在する場合のみ）
4. 見つからなければ既存ハードコード値（後方互換）

2 と 3 の順序は issue #226 で入れ替えた。alpha-forge system init は shell rc への
``export FORGE_CONFIG`` を推奨しているため、env が残ったまま ``--forge-dir`` で
別プロジェクトを指定すると、旧順序（env 優先）では「明示したプロジェクトとは別の
DB を無警告で読む」事故が起きる。``--forge-dir`` のプロジェクトに forge.yaml が
あるならそれが正であり、env はローカルに forge.yaml が無いときのフォールバック
（任意のディレクトリから自分のプロジェクトを開く用途）に限定する。

forge.yaml 内の相対パスは、forge.yaml ファイルの親ディレクトリ基準で絶対化される。
これは alpha-forge の ``alpha_forge/config.py:_resolve_paths`` と同じ規約。
"""

from __future__ import annotations

import logging
import os
import pathlib
from dataclasses import dataclass
from typing import Any

import yaml

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ForgeConfig:
    """forge プロジェクトのパス解決結果。

    すべてのパスは ``from_forge_dir`` ファクトリで構築時に解決済みの絶対パスになる。
    """

    forge_dir: pathlib.Path
    forge_db: pathlib.Path
    strategies_dir: pathlib.Path
    strategies_db: pathlib.Path | None
    ideas_json: pathlib.Path
    live_dir: pathlib.Path
    historical_dir: pathlib.Path

    @classmethod
    def from_forge_dir(
        cls,
        forge_dir: pathlib.Path,
        config_path: pathlib.Path | None = None,
    ) -> ForgeConfig:
        """forge.yaml を読み込んで設定を構築する。

        Args:
            forge_dir: forge プロジェクトのルートディレクトリ。
            config_path: 明示指定する forge.yaml のパス（最優先）。

        Returns:
            解決済みパスを持つ ``ForgeConfig`` インスタンス。
        """
        forge_dir = pathlib.Path(forge_dir).resolve()
        yaml_path = _resolve_yaml_path(forge_dir, config_path)
        raw = _load_yaml(yaml_path) if yaml_path is not None else {}

        # 相対パス解決の基準は forge.yaml の親ディレクトリ。
        # forge.yaml が見つからない場合は forge_dir を基準にする（後方互換）。
        base = yaml_path.parent if yaml_path is not None else forge_dir

        report = raw.get("report") or {}
        strategies = raw.get("strategies") or {}
        ideas = raw.get("ideas") or {}
        live = raw.get("live") or {}
        data_section = raw.get("data") or {}

        report_output = _resolve_path(
            base, report.get("output_path"), default=forge_dir / "data" / "results"
        )
        forge_db_filename = report.get("db_filename") or "backtest_results.db"
        forge_db = report_output / forge_db_filename

        strategies_path = _resolve_path(
            base, strategies.get("path"), default=forge_dir / "data" / "strategies"
        )
        strategies_db: pathlib.Path | None = None
        if bool(strategies.get("use_db", False)):
            strategies_db_filename = strategies.get("db_filename") or "strategies.db"
            strategies_db = strategies_path / strategies_db_filename

        ideas_path = _resolve_path(
            base, ideas.get("ideas_path"), default=forge_dir / "data" / "ideas"
        )
        ideas_json = ideas_path / "ideas.json"

        live_dir = _resolve_path(
            base, live.get("output_path"), default=forge_dir / "data" / "live"
        )

        # OHLC parquet 保存先（alpha-forge ``config.py:_DEFAULT_DATA_STORAGE`` と一致させる）。
        # forge.yaml 側のキー名は alpha-forge と揃えて ``data.storage_path`` を採用する。
        historical_dir = _resolve_path(
            base, data_section.get("storage_path"), default=forge_dir / "data" / "historical"
        )

        return cls(
            forge_dir=forge_dir,
            forge_db=forge_db,
            strategies_dir=strategies_path,
            strategies_db=strategies_db,
            ideas_json=ideas_json,
            live_dir=live_dir,
            historical_dir=historical_dir,
        )


def _resolve_yaml_path(
    forge_dir: pathlib.Path, explicit: pathlib.Path | None
) -> pathlib.Path | None:
    """forge.yaml の最終的な探索結果を返す（見つからなければ None）。

    優先順位: explicit 引数 > ``<forge_dir>/forge.yaml`` > 環境変数 ``FORGE_CONFIG``。
    env をフォールバック採用したときは、意図しないプロジェクトを読んでいないか
    起動ログから追えるよう採用元を INFO で残す（issue #226）。
    """
    if explicit is not None:
        path = pathlib.Path(explicit).resolve()
        return path if path.is_file() else None

    candidate = (forge_dir / "forge.yaml").resolve()
    if candidate.is_file():
        return candidate

    env_value = os.environ.get("FORGE_CONFIG")
    if env_value:
        path = pathlib.Path(env_value).expanduser().resolve()
        if path.is_file():
            logger.info(
                "環境変数 FORGE_CONFIG から forge.yaml を解決しました: %s"
                "（%s/forge.yaml は存在しません。別プロジェクトを参照している場合は"
                " --forge-config で明示するか FORGE_CONFIG を解除してください）",
                path,
                forge_dir,
            )
            return path

    return None


def _load_yaml(path: pathlib.Path) -> dict[str, Any]:
    """forge.yaml を安全にロードする。空ファイルや非辞書ルートは ``{}`` 扱い。"""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    raw = yaml.safe_load(text)
    if isinstance(raw, dict):
        return raw
    return {}


def _resolve_path(
    base: pathlib.Path, value: Any, *, default: pathlib.Path
) -> pathlib.Path:
    """forge.yaml の相対パス文字列を ``base`` 基準で絶対化する。

    値が ``None`` または空のときは ``default`` をそのまま返す。
    """
    if value in (None, ""):
        return default.resolve()
    candidate = pathlib.Path(str(value)).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (base / candidate).resolve()
