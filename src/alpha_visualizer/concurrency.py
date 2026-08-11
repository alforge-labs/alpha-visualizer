"""同期呼び出しを非同期文脈へ載せるための共有ヘルパー。

複数の同期呼び出し（forge CLI・PyPI 照会・ファイル読み取り）を
``asyncio.gather`` で並列に走らせるルーターが共有する。特定のドメインに
依存しないため forge 用ヘルパー（``services/forge_cli.py``）とは分ける。
"""
from __future__ import annotations

import asyncio
from typing import Any


async def call_or_exc(func: Any, *args: Any) -> Any:
    """同期呼び出しを別スレッドで実行し、例外は値として返す（degraded 設計）。

    ``asyncio.gather`` へ渡す呼び出しをすべてこのヘルパで統一して包むことで、
    どれか 1 つが想定外の例外を送出しても gather 全体が例外伝播で落ちて他を
    巻き込むことがない。``gather(return_exceptions=True)`` と違い呼び出し単位で
    捕捉するため、「どの呼び出しが失敗したか」が位置で確定する。
    """
    try:
        return await asyncio.to_thread(func, *args)
    except Exception as exc:  # noqa: BLE001 — degraded 設計: 失敗は unknown に落とす
        return exc
