"""alpha-visualizer 自身のパッケージ更新に関する可否判定とコマンド構築。

「実行中の自分自身を差し替える」操作なので、可否の判定（editable か・
pip / uv のどちらが使えるか）をこのモジュールへ集約し、ルーターと
JobManager は結果だけを見る。
"""
from __future__ import annotations

import importlib.metadata
import json
import shutil
import subprocess
import sys

PACKAGE_NAME = "alpha-visualizer"

#: `pip --version` の待ち上限。存在確認だけなので短くてよい
PIP_PROBE_TIMEOUT_SEC = 15

#: 更新手段が無いときの案内。ルーター（事前ガード）と JobManager（実行時の
#: 保険）の両方から参照するため、判定と同じ場所に 1 つだけ置く
NO_INSTALLER_MESSAGE = (
    "pip も uv も見つからないため更新できません。手動で"
    " `pip install -U alpha-visualizer` を実行してください"
    " / Neither pip nor uv is available."
    " Run `pip install -U alpha-visualizer` manually."
)


def is_editable_install() -> bool:
    """editable（開発チェックアウト）インストールかを判定する（PEP 610）。

    editable に ``pip install -U`` を打つと、作業中のソースツリーとは別に
    PyPI 版が入り込み、どちらが読まれているか分からない状態になる。

    判定できない場合は False（更新を許可）に倒す。``direct_url.json`` が
    読めないのは wheel でも editable でもない特殊な導入形態で、そこまで
    面倒は見ない。
    """
    try:
        raw = importlib.metadata.distribution(PACKAGE_NAME).read_text("direct_url.json")
    except importlib.metadata.PackageNotFoundError:
        return False
    if not raw:
        return False
    try:
        payload = json.loads(raw)
    except ValueError:
        return False
    if not isinstance(payload, dict):
        return False
    dir_info = payload.get("dir_info")
    return bool(isinstance(dir_info, dict) and dir_info.get("editable"))


def build_upgrade_argv() -> list[str] | None:
    """自己更新コマンドを組む。使えるインストーラが無ければ None。

    uv 製 venv には pip が入っていないことが多いため、pip が使えない場合は
    uv へフォールバックする。どちらも無い環境では更新を諦め、呼び出し側が
    手動コマンドを案内する（黙って何もしないより明示的に断る）。
    """
    if _has_pip():
        return [sys.executable, "-m", "pip", "install", "-U", PACKAGE_NAME]
    uv_exe = shutil.which("uv")
    if uv_exe is not None:
        return [uv_exe, "pip", "install", "--python", sys.executable, "-U", PACKAGE_NAME]
    return None


def _has_pip() -> bool:
    """現在のインタプリタで ``python -m pip`` が使えるか。"""
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True,
            timeout=PIP_PROBE_TIMEOUT_SEC,
            stdin=subprocess.DEVNULL,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return proc.returncode == 0
