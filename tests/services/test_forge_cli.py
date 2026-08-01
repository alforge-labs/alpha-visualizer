"""forge CLI 呼び出しヘルパー（services/forge_cli.py）のテスト。

``resolve_forge_exe`` は ``shutil.which`` を実際に走らせて検証する。他のテストは
``shutil.which`` 自体をモックするため、探す実行ファイル名が誤っていても検出できない
（実際に「forge」のまま取り残されて実行系機能が全滅した）。
"""

from __future__ import annotations

import pathlib
import stat

import pytest

from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    resolve_forge_exe,
)


def _make_exe(bin_dir: pathlib.Path, name: str) -> pathlib.Path:
    """PATH 上に置く実行可能ファイルを作る。"""
    bin_dir.mkdir(parents=True, exist_ok=True)
    exe = bin_dir / name
    exe.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    exe.chmod(exe.stat().st_mode | stat.S_IXUSR)
    return exe


def test_PATH上のalpha_forgeを解決する(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AlphaForge CLI の実行ファイル名は ``alpha-forge``。

    AlphaForge は v0.5.0 で ``forge`` → ``alpha-forge`` にリネームしており、
    インストーラ（alforge-labs/install.sh）は旧 ``forge`` symlink を削除する。
    ここが旧名のままだと、forge 導入済みの環境でも実行系機能（整理・run・
    jobs・戦略保存）がすべて「forge コマンドが見つかりません」で止まる。
    """
    exe = _make_exe(tmp_path / "bin", "alpha-forge")
    monkeypatch.setenv("PATH", str(tmp_path / "bin"))

    assert resolve_forge_exe() == str(exe)


def test_旧名forgeにはフォールバックしない(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``forge`` は掴まない。

    ``forge`` は Foundry（Solidity 開発ツール）のコマンド名でもある。PyPI で広く
    配布される以上、同名の無関係なバイナリへ backtest 引数を渡す事故のほうが、
    旧 v0.4.x を使い続けるユーザーへの互換性より重い。
    """
    _make_exe(tmp_path / "bin", "forge")
    monkeypatch.setenv("PATH", str(tmp_path / "bin"))

    assert resolve_forge_exe() is None


def test_未導入メッセージは実在するコマンド名を案内する() -> None:
    """案内するコマンド名は、実際に PATH を探す名前と一致していること。

    導入導線のメッセージなので、存在しない ``forge`` を名指しするとユーザーが
    誤った名前で PATH を確認して行き詰まる。
    """
    assert "alpha-forge" in FORGE_NOT_FOUND_MESSAGE
