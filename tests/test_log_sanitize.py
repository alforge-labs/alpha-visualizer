"""log_sanitize ユーティリティのテスト"""
from __future__ import annotations

from alpha_visualizer.log_sanitize import sanitize_for_log


def test_removes_lf() -> None:
    assert sanitize_for_log("foo\nbar") == "foo bar"


def test_removes_cr() -> None:
    assert sanitize_for_log("foo\rbar") == "foo bar"


def test_removes_crlf() -> None:
    assert sanitize_for_log("foo\r\nbar") == "foo  bar"


def test_passes_through_normal_text() -> None:
    assert sanitize_for_log("strategy_xyz_v1") == "strategy_xyz_v1"


def test_handles_none() -> None:
    assert sanitize_for_log(None) == "None"


def test_handles_non_str() -> None:
    assert sanitize_for_log(123) == "123"


def test_blocks_log_injection_payload() -> None:
    """注入ペイロード: 改行で偽ログ行を作ろうとする試み"""
    payload = "valid_id\nERROR fake admin login from 1.2.3.4"
    cleaned = sanitize_for_log(payload)
    assert "\n" not in cleaned
    assert "\r" not in cleaned
