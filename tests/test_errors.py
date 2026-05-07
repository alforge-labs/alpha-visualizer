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
