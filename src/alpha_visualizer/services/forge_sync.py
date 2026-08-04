"""forge CLI の同期実行ヘルパー。

``routers/maintenance.py``（prune-orphans）と ``routers/data.py``（data list）の
両方から使う「同期 subprocess 実行 → JSON パース → 失敗の案内文変換」を集約する。
純粋関数・定数は従来どおり ``services/forge_cli.py`` に置き、本モジュールは
プロセス起動を伴う処理だけを持つ。
"""
from __future__ import annotations

import subprocess
from typing import Any

from alpha_visualizer.errors import ExternalProcessError, ForgeCliNotFoundError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    build_forge_env,
    mask_home,
    parse_json_lenient,
    resolve_forge_exe,
    translate_forge_failure,
)


def run_forge_json(
    argv: list[str], forge_cfg: ForgeConfig, timeout: int
) -> dict[str, Any]:
    """forge を同期実行し、stdout の JSON を返す。"""
    exe = resolve_forge_exe()
    if exe is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)

    try:
        proc = subprocess.run(
            [exe, *argv],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=build_forge_env(forge_cfg),
            cwd=str(forge_cfg.forge_dir),
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as e:
        raise ExternalProcessError(f"forge がタイムアウトしました（{timeout} 秒）") from e

    if proc.returncode != 0:
        # 空一覧を返して成功に見せてはいけない。
        # 既知の失敗（EULA 未同意 / forge が古くサブコマンドを持たない）は、
        # 生の Click 出力ではなく次の一歩を示す案内に変換する。
        guidance = translate_forge_failure(proc.stdout or "", proc.stderr or "")
        if guidance is not None:
            raise ExternalProcessError(guidance)
        raw = proc.stderr or proc.stdout or ""
        detail = mask_home(raw.strip())
        raise ExternalProcessError(f"forge が異常終了しました（exit {proc.returncode}）: {detail}")

    payload = parse_json_lenient(proc.stdout)
    if payload is None:
        raise ExternalProcessError("forge の出力を JSON として解釈できませんでした")
    return payload
