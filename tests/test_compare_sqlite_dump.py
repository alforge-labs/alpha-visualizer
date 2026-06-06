"""scripts/compare_sqlite_dump.py の論理比較テスト（issue #223）。

SQLite はファイルヘッダに書き込みライブラリのバージョンを記録するため、
同一内容でも生成環境によってバイナリは一致しない。drift check が
「論理的に同一なら pass / 内容が違えば fail」になることを保証する。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from scripts.compare_sqlite_dump import dump_sql, main


def _make_db(path: Path, rows: list[tuple[int, str]]) -> None:
    con = sqlite3.connect(path)
    try:
        con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)")
        con.executemany("INSERT INTO t VALUES (?, ?)", rows)
        con.commit()
    finally:
        con.close()


def test_identical_content_passes(tmp_path: Path) -> None:
    a = tmp_path / "a.db"
    b = tmp_path / "b.db"
    rows = [(1, "alpha"), (2, "beta")]
    _make_db(a, rows)
    _make_db(b, rows)
    # バイナリ一致は前提にしない（ヘッダ差を擬似的に作る代わりに、
    # 別ファイルとして独立生成した DB 同士が論理一致することを確認）
    assert main([str(a), str(b)]) == 0


def test_different_content_fails(tmp_path: Path) -> None:
    a = tmp_path / "a.db"
    b = tmp_path / "b.db"
    _make_db(a, [(1, "alpha")])
    _make_db(b, [(1, "ALPHA")])
    assert main([str(a), str(b)]) == 1


def test_header_version_difference_is_ignored(tmp_path: Path) -> None:
    """ヘッダ（SQLITE_VERSION_NUMBER 等）だけが違う DB は論理一致とみなす。

    issue #223 の再現: offset 96 の書き込みライブラリバージョンを書き換えても
    SQL ダンプ比較は影響を受けない。
    """
    a = tmp_path / "a.db"
    _make_db(a, [(1, "alpha")])
    b = tmp_path / "b.db"
    data = bytearray(a.read_bytes())
    # offset 96-99: SQLITE_VERSION_NUMBER (big-endian)。別バージョンに偽装する。
    data[96:100] = (3500400).to_bytes(4, "big")
    b.write_bytes(bytes(data))
    assert a.read_bytes() != b.read_bytes()  # バイナリは不一致
    assert main([str(a), str(b)]) == 0  # 論理は一致


def test_dump_sql_is_deterministic(tmp_path: Path) -> None:
    a = tmp_path / "a.db"
    _make_db(a, [(1, "alpha"), (2, "beta")])
    assert dump_sql(a) == dump_sql(a)
    assert "CREATE TABLE t" in dump_sql(a)


def test_usage_error_returns_2() -> None:
    assert main([]) == 2
    assert main(["only-one.db"]) == 2


def test_missing_file_fails(tmp_path: Path) -> None:
    a = tmp_path / "a.db"
    _make_db(a, [(1, "alpha")])
    with pytest.raises(SystemExit) as exc:
        main([str(a), str(tmp_path / "missing.db")])
    assert exc.value.code == 2
