"""PyPI から配布パッケージの最新版を取得し、現在版と比較する。

``GET /api/versions`` の latest 列のためだけに使う。``pyproject.toml`` の
``dependencies`` に HTTP クライアントは無く、この 1 機能のために httpx /
requests を実行時依存へ足す価値はないため標準ライブラリで実装する。

取得失敗は例外にせず ``None`` を返す。オフラインや PyPI 障害は「最新版が
分からない」だけであり、現在版の表示や他コンポーネントの照会まで巻き込んで
はいけない（degraded 設計・``routers/setup.py`` と同じ思想）。
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

#: 1 パッケージあたりの取得上限。画面表示の待ち時間に直結するため短くする
PYPI_TIMEOUT_SEC = 5


def fetch_latest_version(package: str) -> str | None:
    """PyPI JSON API から ``package`` の最新版を返す（失敗時 None）。"""
    url = f"https://pypi.org/pypi/{package}/json"
    try:
        with urllib.request.urlopen(url, timeout=PYPI_TIMEOUT_SEC) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        logger.info("PyPI から %s の最新版を取得できませんでした: %s", package, exc)
        return None
    if not isinstance(payload, dict):
        return None
    info = payload.get("info")
    version = info.get("version") if isinstance(info, dict) else None
    return version if isinstance(version, str) and version else None


def is_newer(latest: str, current: str) -> bool:
    """``latest`` が ``current`` より新しいかを判定する。

    packaging を依存へ加えないための最小実装。ドット区切りの数値部だけを
    比較し、数値化できない要素（``1.7.0rc1`` 等）が現れたら False に倒す。
    誤って「更新あり」と出すより出さない方が安全である（更新は実行中の
    バイナリ・パッケージを差し替える破壊的操作のため）。
    """
    try:
        left = tuple(int(part) for part in latest.split("."))
        right = tuple(int(part) for part in current.split("."))
    except ValueError:
        return False
    return left > right
