"""alpha-visualizer 自己更新の可否判定（services/self_update.py）のテスト。

「実行中の自分自身を差し替える」操作なので、判定を誤ると開発チェックアウトが
壊れる・更新できない環境で無意味なジョブが走るといった実害が出る。
"""
from __future__ import annotations

import json
import subprocess
import sys
from typing import Any
from unittest import mock

from alpha_visualizer.services.self_update import (
    PACKAGE_NAME,
    build_upgrade_argv,
    is_editable_install,
)


def _distribution_with(direct_url: str | None) -> Any:
    dist = mock.Mock()
    dist.read_text.return_value = direct_url
    return dist


def test_editableインストールを検出する() -> None:
    payload = json.dumps({"url": "file:///home/u/dev/alpha-visualizer", "dir_info": {"editable": True}})
    with mock.patch(
        "alpha_visualizer.services.self_update.importlib.metadata.distribution",
        return_value=_distribution_with(payload),
    ):
        assert is_editable_install() is True


def test_wheel導入はeditableでない() -> None:
    with mock.patch(
        "alpha_visualizer.services.self_update.importlib.metadata.distribution",
        return_value=_distribution_with(None),
    ):
        assert is_editable_install() is False


def test_direct_urlが壊れていても更新を止めない() -> None:
    """判定不能は False（更新を許可）に倒す。特殊な導入形態まで面倒は見ない。"""
    with mock.patch(
        "alpha_visualizer.services.self_update.importlib.metadata.distribution",
        return_value=_distribution_with("{ broken"),
    ):
        assert is_editable_install() is False


def test_pipが使えるならpipを選ぶ() -> None:
    ok = subprocess.CompletedProcess(args=[], returncode=0, stdout=b"", stderr=b"")
    with mock.patch("alpha_visualizer.services.self_update.subprocess.run", return_value=ok):
        assert build_upgrade_argv() == [
            sys.executable, "-m", "pip", "install", "-U", PACKAGE_NAME
        ]


def test_pipが無ければuvへフォールバックする() -> None:
    """uv 製 venv には pip が入っていないことが多い。"""
    ng = subprocess.CompletedProcess(args=[], returncode=1, stdout=b"", stderr=b"")
    with (
        mock.patch("alpha_visualizer.services.self_update.subprocess.run", return_value=ng),
        mock.patch(
            "alpha_visualizer.services.self_update.shutil.which", return_value="/opt/bin/uv"
        ),
    ):
        assert build_upgrade_argv() == [
            "/opt/bin/uv", "pip", "install", "--python", sys.executable, "-U", PACKAGE_NAME
        ]


def test_pipもuvも無ければNone() -> None:
    ng = subprocess.CompletedProcess(args=[], returncode=1, stdout=b"", stderr=b"")
    with (
        mock.patch("alpha_visualizer.services.self_update.subprocess.run", return_value=ng),
        mock.patch("alpha_visualizer.services.self_update.shutil.which", return_value=None),
    ):
        assert build_upgrade_argv() is None
