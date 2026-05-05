"""共通テストフィクスチャ"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _clear_forge_config_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """テスト中の FORGE_CONFIG 漏れを防ぐ。

    開発環境のシェルに ``FORGE_CONFIG=/path/to/alpha-strategies/forge.yaml`` が
    設定されていると、forge.yaml 探索順序のテストが意図しない挙動になる。
    全テストでデフォルト「環境変数なし」を保証し、必要なテストは個別に
    ``monkeypatch.setenv`` で明示する。
    """
    monkeypatch.delenv("FORGE_CONFIG", raising=False)
