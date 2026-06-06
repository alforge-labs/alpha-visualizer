"""SQLite DB を論理比較（SQL ダンプ）する CI 用ユーティリティ（issue #223）。

SQLite はファイルヘッダ（offset 96）に書き込みライブラリの
``SQLITE_VERSION_NUMBER`` を記録するため、同一スクリプト・同一 seed で
生成した DB でも、生成環境の SQLite バージョンが違うとバイナリは一致しない。
drift check（E2E fixture / OSS sample-forge）ではバイナリの ``git diff`` では
なく本スクリプトで ``iterdump()`` の SQL ダンプを比較する。

使い方::

    uv run python scripts/compare_sqlite_dump.py <committed.db> <regenerated.db>

終了コード: 0 = 論理一致 / 1 = 内容差分あり / 2 = 引数・ファイルエラー
"""

from __future__ import annotations

import difflib
import sqlite3
import sys
from pathlib import Path


def dump_sql(path: Path) -> str:
    """DB の全スキーマ・全行を決定論的な SQL ダンプ文字列にする。"""
    con = sqlite3.connect(path)
    try:
        return "\n".join(con.iterdump())
    finally:
        con.close()


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(
            "usage: compare_sqlite_dump.py <committed.db> <regenerated.db>",
            file=sys.stderr,
        )
        return 2

    a, b = Path(argv[0]), Path(argv[1])
    for p in (a, b):
        if not p.is_file():
            print(f"[error] file not found: {p}", file=sys.stderr)
            raise SystemExit(2)

    dump_a, dump_b = dump_sql(a), dump_sql(b)
    if dump_a == dump_b:
        print(f"[ok] logical dump identical: {a} == {b}")
        return 0

    sys.stdout.writelines(
        difflib.unified_diff(
            dump_a.splitlines(keepends=True),
            dump_b.splitlines(keepends=True),
            fromfile=str(a),
            tofile=str(b),
            n=3,
        )
    )
    print(f"[error] logical dump differs: {a} != {b}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
