"""PyPI 最新版取得（services/pypi.py）のテスト。

設計の要点:

- 取得失敗は例外にせず None。オフライン・PyPI 障害は「最新版が分からない」
  だけで、現在版の表示や他コンポーネントの照会を巻き込んではいけない
- is_newer は数値部だけを比較する。判定できない形式では False に倒す
  （誤って「更新あり」と出すより出さない方が安全 — 更新は破壊的操作）
"""
from __future__ import annotations

import io
import json
import urllib.error
from typing import Any
from unittest import mock

import pytest

from alpha_visualizer.services.pypi import fetch_latest_version, is_newer


def _urlopen_returning(payload: dict[str, Any]) -> Any:
    """urlopen のコンテキストマネージャ互換スタブを作る。"""
    body = json.dumps(payload).encode("utf-8")
    cm = mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(body)
    cm.__exit__.return_value = False
    return mock.Mock(return_value=cm)


def test_正常系はinfo_versionを返す() -> None:
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        _urlopen_returning({"info": {"version": "1.7.0"}}),
    ):
        assert fetch_latest_version("alpha-visualizer") == "1.7.0"


def test_404はNoneを返す() -> None:
    err = urllib.error.HTTPError("https://pypi.org", 404, "Not Found", {}, None)  # type: ignore[arg-type]
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen", side_effect=err
    ):
        assert fetch_latest_version("no-such-package") is None


def test_タイムアウトはNoneを返す() -> None:
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        side_effect=TimeoutError("timed out"),
    ):
        assert fetch_latest_version("alpha-visualizer") is None


def test_不正JSONはNoneを返す() -> None:
    cm = mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(b"not json at all")
    cm.__exit__.return_value = False
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        mock.Mock(return_value=cm),
    ):
        assert fetch_latest_version("alpha-visualizer") is None


def test_versionキーが無ければNone() -> None:
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        _urlopen_returning({"info": {}}),
    ):
        assert fetch_latest_version("alpha-visualizer") is None


@pytest.mark.parametrize(
    ("latest", "current", "expected"),
    [
        ("1.7.0", "1.6.0", True),
        ("1.6.1", "1.6.0", True),
        ("2.0.0", "1.99.99", True),
        ("1.6.0", "1.6.0", False),
        ("1.5.0", "1.6.0", False),
        # 数値化できない形式では「更新あり」と言わない
        ("1.7.0rc1", "1.6.0", False),
        ("", "1.6.0", False),
    ],
)
def test_is_newer(latest: str, current: str, expected: bool) -> None:
    assert is_newer(latest, current) is expected
