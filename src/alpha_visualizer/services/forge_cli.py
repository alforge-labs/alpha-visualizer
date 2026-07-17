"""forge CLI 呼び出しの共有ヘルパー。

``routers/run.py``（同期 1 発実行）と ``services/jobs.py``（非同期ジョブ基盤）の
両方から使う純粋関数・定数を集約する。プロセス起動そのものは呼び出し側の責務。
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
from typing import Any

from alpha_visualizer.forge_config import ForgeConfig

# forge 未導入ユーザーが実行系機能に触れた瞬間は AlphaForge 導入意欲が
# 最も高い接点なので、インストール先への導線を必ず含める。
FORGE_NOT_FOUND_MESSAGE = (
    "forge コマンドが見つかりません。AlphaForge を導入してください"
    " / forge command not found in PATH. Install AlphaForge"
    " — https://alforgelabs.com"
)


def resolve_forge_exe() -> str | None:
    """PATH 上の forge 実行ファイルを解決する（無ければ None）。"""
    return shutil.which("forge")


def build_forge_env(forge_cfg: ForgeConfig) -> dict[str, str]:
    """forge CLI サブプロセス用の環境変数を構築する。

    - ``FORGE_NONINTERACTIVE=1``: 破壊的操作の確認プロンプト（forge_confirm）を
      非対話化する。EULA 未同意時の Confirm.ask() はこれでは防げない（非対話
      同意は ``FORGE_ACCEPT_EULA`` のみ）ため、呼び出し側は必ず
      ``stdin=DEVNULL`` でハングせず即座に失敗させること。
    - ``FORGE_CONFIG``: forge_dir に forge.yaml があればそれを明示する。
    """
    env = os.environ.copy()
    env["FORGE_NONINTERACTIVE"] = "1"
    forge_yaml = forge_cfg.forge_dir / "forge.yaml"
    if forge_yaml.exists():
        env["FORGE_CONFIG"] = str(forge_yaml)
    return env


def mask_home(text: str) -> str:
    """ホームディレクトリの絶対パスを ``~`` にマスクする。

    forge の出力にはデータ保存先などの絶対パスが含まれうる。非 localhost
    バインドで公開された場合にユーザー名等の実行環境情報が API レスポンス
    経由で漏れないようにする。
    """
    home = str(pathlib.Path.home())
    return text.replace(home, "~")


def parse_json_lenient(stdout: str) -> dict[str, Any] | None:
    """``--json`` の stdout を寛容にパースして dict を返す。

    stdout 全体が JSON でない場合も、警告行などが前後に混ざっただけの
    可能性があるため、最初の ``{`` から最後の ``}`` までの抽出を試す。
    dict にならなければ None。
    """
    candidates = [stdout]
    start = stdout.find("{")
    end = stdout.rfind("}")
    if 0 <= start < end:
        candidates.append(stdout[start : end + 1])
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, dict):
            return data
    return None
