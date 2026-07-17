"""tuning service（パラメータ差し替え一時ファイル生成）のテスト。"""

from __future__ import annotations

import json
import os
import pathlib

import pytest

from alpha_visualizer.errors import InvalidRequestError
from alpha_visualizer.services.tuning import build_override_file

RAW = json.dumps(
    {
        "strategy_id": "strat_a",
        "name": "テスト戦略",
        "timeframe": "1d",
        "parameters": {"period": 20, "threshold": 1.5, "use_filter": True},
        "indicators": [{"type": "sma", "period": 20}],
    }
)


class TestBuildOverrideFile:
    def test_overrides_only_given_parameters(self, tmp_path: pathlib.Path) -> None:
        """指定したキーだけ上書きし、他のパラメータと定義全体は維持する。

        strategy_id を維持することで、--strategy-file 実行でも元戦略の
        実行履歴に通常ランとして記録される（履歴タブで比較可能）。
        """
        path = build_override_file(RAW, {"period": 30}, tmp_path)

        data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        assert data["strategy_id"] == "strat_a"
        assert data["parameters"] == {"period": 30, "threshold": 1.5, "use_filter": True}
        assert data["indicators"] == [{"type": "sma", "period": 20}]

    def test_accepts_scalar_types(self, tmp_path: pathlib.Path) -> None:
        path = build_override_file(
            RAW, {"threshold": 2.0, "use_filter": False}, tmp_path
        )
        data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        assert data["parameters"]["threshold"] == 2.0
        assert data["parameters"]["use_filter"] is False

    def test_rejects_unknown_parameter_key(self, tmp_path: pathlib.Path) -> None:
        """定義に存在しないパラメータ名は境界で拒否する（タイポの早期検知）"""
        with pytest.raises(InvalidRequestError):
            build_override_file(RAW, {"nonexistent": 1}, tmp_path)

    def test_rejects_non_scalar_value(self, tmp_path: pathlib.Path) -> None:
        """ネスト構造の注入は拒否する（parameters はスカラーのみ）"""
        with pytest.raises(InvalidRequestError):
            build_override_file(RAW, {"period": {"nested": 1}}, tmp_path)

    def test_rejects_corrupt_definition(self, tmp_path: pathlib.Path) -> None:
        with pytest.raises(InvalidRequestError):
            build_override_file("not json", {"period": 1}, tmp_path)

    def test_rejects_empty_override(self, tmp_path: pathlib.Path) -> None:
        with pytest.raises(InvalidRequestError):
            build_override_file(RAW, {}, tmp_path)

    @pytest.mark.skipif(os.name != "posix", reason="POSIX パーミッションのみ検証")
    def test_file_is_owner_only_readable(self, tmp_path: pathlib.Path) -> None:
        """一時戦略ファイルは 0600 で作成する。

        共有 /tmp に書くため、他ユーザーから戦略パラメータ（非公開資産）が
        読めないようにする（CWE-377 対策）。
        """
        path = build_override_file(RAW, {"period": 30}, tmp_path)
        mode = pathlib.Path(path).stat().st_mode & 0o777
        assert mode == 0o600
