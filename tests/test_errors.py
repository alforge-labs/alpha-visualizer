"""errors モジュールのテスト。"""
from __future__ import annotations

import pytest

from alpha_visualizer.errors import (
    AlphaVisualizerError,
    DataCorruptError,
    ExternalProcessError,
    InvalidRequestError,
    NotFoundError,
)


def test_base_class_is_subclass_of_exception() -> None:
    assert issubclass(AlphaVisualizerError, Exception)


def test_base_class_default_status_code() -> None:
    assert AlphaVisualizerError.status_code == 500


@pytest.mark.parametrize(
    "exc_cls,expected_status",
    [
        (NotFoundError, 404),
        (InvalidRequestError, 400),
        (ExternalProcessError, 500),
        (DataCorruptError, 500),
    ],
)
def test_subclass_status_codes(
    exc_cls: type[AlphaVisualizerError], expected_status: int
) -> None:
    assert exc_cls.status_code == expected_status
    assert issubclass(exc_cls, AlphaVisualizerError)


def test_carries_message() -> None:
    e = NotFoundError("foo not found")
    assert str(e) == "foo not found"


def test_can_be_caught_as_base() -> None:
    """LSP: 派生クラスは基底として捕捉できる。"""
    with pytest.raises(AlphaVisualizerError):
        raise NotFoundError("x")


def test_agent_disabled_error_is_403_with_code() -> None:
    """非 loopback 公開時にエージェント起動を拒む例外。

    WHY: エージェント起動は任意コード実行に近く、LAN 公開サーバーの UI から
    他者が踏める状態にしてはならない。フロントが言語別案内を出せるよう
    機械可読 code を持つ。
    """
    from alpha_visualizer.errors import AgentDisabledError

    err = AgentDisabledError("disabled")
    assert err.status_code == 403
    assert err.code == "agent_disabled"


def test_agent_cli_not_found_error_is_503_with_code() -> None:
    """agent CLI 未導入は想定内の状態（forge 未導入の 503 規約と同じ）。"""
    from alpha_visualizer.errors import AgentCliNotFoundError

    err = AgentCliNotFoundError("not found")
    assert err.status_code == 503
    assert err.code == "agent_cli_not_found"
