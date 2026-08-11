"""call_or_exc（同期呼び出しの degraded 実行ヘルパー）のテスト。

``routers/setup.py``・``routers/versions.py`` が ``asyncio.gather`` へ渡す
呼び出しを包むヘルパー。存在理由は「1 つの失敗で gather 全体を落とさない」
ことなので、例外を送出せず値として返す契約を検証する。
"""
from __future__ import annotations

import asyncio
import threading

import pytest

from alpha_visualizer.concurrency import call_or_exc

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def test_returns_value_on_success() -> None:
    assert await call_or_exc(lambda a, b: a + b, 1, 2) == 3


async def test_returns_exception_instead_of_raising() -> None:
    """失敗は送出せず値で返す。呼び出し側は isinstance で degraded 判定する。"""
    error = RuntimeError("boom")

    def _fail() -> None:
        raise error

    assert await call_or_exc(_fail) is error


async def test_gather_keeps_other_results_when_one_fails() -> None:
    """degraded 設計の本質: 1 つ失敗しても他の呼び出しの結果は失われない。"""

    def _fail() -> None:
        raise ValueError("boom")

    ok_r, ng_r = await asyncio.gather(call_or_exc(lambda: "ok"), call_or_exc(_fail))

    assert ok_r == "ok"
    assert isinstance(ng_r, ValueError)


async def test_runs_in_worker_thread() -> None:
    """同期 CLI 呼び出しでイベントループを塞がないよう別スレッドで実行する。"""
    worker_ident = await call_or_exc(threading.get_ident)

    assert worker_ident != threading.get_ident()
