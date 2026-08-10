# 各種ツールのバージョン確認と更新の GUI 化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メンテナンス画面で alpha-forge / alpha-visualizer / alpha-strike の現在版と最新版を確認し、更新可能なものは GUI から更新できるようにする。

**Architecture:** `GET /api/versions` が 3 コンポーネントを `asyncio.gather` で並列照会し、個別の失敗は `unknown` に落として 200 を維持する（`routers/setup.py` と同じ degraded 方式）。更新は既存 `JobManager` に新 kind を足して SSE 進捗に乗せる。alpha-visualizer の自己更新だけは更新後に `os.execv` で自分を再起動する。

**Tech Stack:** FastAPI / Pydantic / uvicorn / asyncio subprocess / React + TypeScript (Vite) / pytest / vitest

設計: [`docs/superpowers/specs/2026-08-10-tool-versions-design.md`](../specs/2026-08-10-tool-versions-design.md)

## Global Constraints

- 対象リポジトリは alpha-visualizer（Task 1〜9）と alpha-strike（Task 10）。**alpha-forge は変更しない**。
- `src/alpha_visualizer/` から `alpha_forge` を import しない（alpha-visualizer 固有ルール）。
- **新規の実行時依存を追加しない**。HTTP は標準ライブラリ `urllib.request` を使う。
- ruff の select は `["E", "F", "I", "UP", "B", "C4", "PTH"]`、line-length 100、`E501` は ignore。`PTH` があるため `os.path` ではなく `pathlib` を使う。
- mypy は `src/alpha_visualizer` 全体に掛かる。全関数に引数・戻り値の型注釈を付ける。
- カバレッジは `fail_under = 90`。
- `src/alpha_visualizer/schemas/*.py` を変更したら **必ず `cd frontend && pnpm run gen`** を実行し、生成物（`frontend/openapi.json`・`frontend/src/api/types.gen.ts`）もコミットする。CI の `openapi-types` ジョブが drift を検出する。
- コミットメッセージは Conventional Commits ＋ 日本語本文。Co-Authored-By 等の署名は付けない（本リポジトリの既存コミットに倣う）。
- ブランチは `feat/tool-versions`（作成済み）。ワークツリー: `/Users/sakae/dev/alpha-trade/.claude/worktrees/alpha-visualizer-tool-versions`。
- ユーザー向け文言は日英併記（`"日本語 / English"`）。既存の `FORGE_NOT_FOUND_MESSAGE`・`AGENT_DISABLED_MESSAGE` と同じ形式。

## File Structure

| ファイル | 責務 | Task |
|---|---|---|
| `src/alpha_visualizer/services/pypi.py` | PyPI 最新版取得とバージョン比較 | 1 |
| `src/alpha_visualizer/forge_config.py` | `live_events_dir` / `remote_enabled` の解決を追加 | 2 |
| `src/alpha_visualizer/schemas/versions.py` | `/api/versions` のレスポンス型 | 3 |
| `src/alpha_visualizer/routers/versions.py` | 照会と更新起動 | 3・5・6・7 |
| `src/alpha_visualizer/app.py` | ルーター登録・`restart_requested` 初期化 | 3・7 |
| `src/alpha_visualizer/services/self_update.py` | editable 判定と pip/uv コマンド構築 | 6 |
| `src/alpha_visualizer/services/jobs.py` | 新 kind 2 種の argv 構築と分岐 | 5・6 |
| `src/alpha_visualizer/cli.py` | `uvicorn_server` の公開と `os.execv` | 7 |
| `frontend/src/api/{client,types}.ts` | API 呼び出しと型 alias | 4 |
| `frontend/src/hooks/useVersions.ts` | 一覧取得・再取得 | 4 |
| `frontend/src/hooks/useServerRestart.ts` | `/health` ポーリングとリロード | 8 |
| `frontend/src/components/maintenance/VersionsPanel.tsx` | バージョン表のプレゼンテーション | 4・8 |
| `frontend/src/screens/MaintenanceScreen.tsx` | パネルの配置 | 4 |
| `frontend/src/pages/MaintenancePage.tsx` | hook 接続 | 4・8 |

---

### Task 1: PyPI 最新版の取得

**Files:**
- Create: `src/alpha_visualizer/services/pypi.py`
- Test: `tests/services/test_pypi.py`

**Interfaces:**
- Consumes: なし
- Produces:
  - `fetch_latest_version(package: str) -> str | None`
  - `is_newer(latest: str, current: str) -> bool`
  - `PYPI_TIMEOUT_SEC: int = 5`

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_pypi.py`:

```python
"""PyPI 最新版取得（services/pypi.py）のテスト。

設計の要点:

- 取得失敗は例外にせず None。オフライン・PyPI 障害は「最新版が分からない」
  だけで、現在版の表示や他コンポーネントの照会を巻き込んではいけない
- is_newer は数値部だけを比較する。判定できない形式では False に倒す
  （誤って「更新あり」と出すより出さない方が安全 — 更新は破壊的操作）
"""
from __future__ import annotations

import io
import json
import urllib.error
from typing import Any
from unittest import mock

import pytest

from alpha_visualizer.services.pypi import fetch_latest_version, is_newer


def _urlopen_returning(payload: dict[str, Any]) -> Any:
    """urlopen のコンテキストマネージャ互換スタブを作る。"""
    body = json.dumps(payload).encode("utf-8")
    cm = mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(body)
    cm.__exit__.return_value = False
    return mock.Mock(return_value=cm)


def test_正常系はinfo_versionを返す() -> None:
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        _urlopen_returning({"info": {"version": "1.7.0"}}),
    ):
        assert fetch_latest_version("alpha-visualizer") == "1.7.0"


def test_404はNoneを返す() -> None:
    err = urllib.error.HTTPError("https://pypi.org", 404, "Not Found", {}, None)  # type: ignore[arg-type]
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen", side_effect=err
    ):
        assert fetch_latest_version("no-such-package") is None


def test_タイムアウトはNoneを返す() -> None:
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        side_effect=TimeoutError("timed out"),
    ):
        assert fetch_latest_version("alpha-visualizer") is None


def test_不正JSONはNoneを返す() -> None:
    cm = mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(b"not json at all")
    cm.__exit__.return_value = False
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        mock.Mock(return_value=cm),
    ):
        assert fetch_latest_version("alpha-visualizer") is None


def test_versionキーが無ければNone() -> None:
    with mock.patch(
        "alpha_visualizer.services.pypi.urllib.request.urlopen",
        _urlopen_returning({"info": {}}),
    ):
        assert fetch_latest_version("alpha-visualizer") is None


@pytest.mark.parametrize(
    ("latest", "current", "expected"),
    [
        ("1.7.0", "1.6.0", True),
        ("1.6.1", "1.6.0", True),
        ("2.0.0", "1.99.99", True),
        ("1.6.0", "1.6.0", False),
        ("1.5.0", "1.6.0", False),
        # 数値化できない形式では「更新あり」と言わない
        ("1.7.0rc1", "1.6.0", False),
        ("", "1.6.0", False),
    ],
)
def test_is_newer(latest: str, current: str, expected: bool) -> None:
    assert is_newer(latest, current) is expected
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/services/test_pypi.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'alpha_visualizer.services.pypi'`

- [ ] **Step 3: 実装する**

`src/alpha_visualizer/services/pypi.py`:

```python
"""PyPI から配布パッケージの最新版を取得し、現在版と比較する。

``GET /api/versions`` の latest 列のためだけに使う。``pyproject.toml`` の
``dependencies`` に HTTP クライアントは無く、この 1 機能のために httpx /
requests を実行時依存へ足す価値はないため標準ライブラリで実装する。

取得失敗は例外にせず ``None`` を返す。オフラインや PyPI 障害は「最新版が
分からない」だけであり、現在版の表示や他コンポーネントの照会まで巻き込んで
はいけない（degraded 設計・``routers/setup.py`` と同じ思想）。
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

#: 1 パッケージあたりの取得上限。画面表示の待ち時間に直結するため短くする
PYPI_TIMEOUT_SEC = 5


def fetch_latest_version(package: str) -> str | None:
    """PyPI JSON API から ``package`` の最新版を返す（失敗時 None）。"""
    url = f"https://pypi.org/pypi/{package}/json"
    try:
        with urllib.request.urlopen(url, timeout=PYPI_TIMEOUT_SEC) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        logger.info("PyPI から %s の最新版を取得できませんでした: %s", package, exc)
        return None
    if not isinstance(payload, dict):
        return None
    info = payload.get("info")
    version = info.get("version") if isinstance(info, dict) else None
    return version if isinstance(version, str) and version else None


def is_newer(latest: str, current: str) -> bool:
    """``latest`` が ``current`` より新しいかを判定する。

    packaging を依存へ加えないための最小実装。ドット区切りの数値部だけを
    比較し、数値化できない要素（``1.7.0rc1`` 等）が現れたら False に倒す。
    誤って「更新あり」と出すより出さない方が安全である（更新は実行中の
    バイナリ・パッケージを差し替える破壊的操作のため）。
    """
    try:
        left = tuple(int(part) for part in latest.split("."))
        right = tuple(int(part) for part in current.split("."))
    except ValueError:
        return False
    return left > right
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/services/test_pypi.py -v && uv run ruff check src/ tests/ && uv run mypy`
Expected: 全 PASS、ruff / mypy ともエラーなし

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/services/pypi.py tests/services/test_pypi.py
git commit -m "feat: PyPI から最新版を取得する services/pypi を追加"
```

---

### Task 2: `ForgeConfig` に `live_events_dir` / `remote_enabled` を追加

**Files:**
- Modify: `src/alpha_visualizer/forge_config.py:40-119`
- Test: `tests/test_forge_config.py`（末尾に追記）

**Interfaces:**
- Consumes: なし
- Produces: `ForgeConfig.live_events_dir: pathlib.Path` / `ForgeConfig.remote_enabled: bool`
  （どちらも `from_forge_dir` で解決済み。`live_events_dir` は絶対パス）

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_forge_config.py` の末尾に追記:

```python
def test_remote_local_events_pathをforge_yaml基準で解決する(tmp_path: pathlib.Path) -> None:
    """local_events_path は forge.yaml の親ディレクトリ基準（他キーと同じ規約）。"""
    (tmp_path / "forge.yaml").write_text(
        "remote:\n"
        "  enabled: true\n"
        '  local_events_path: "./data/live/events"\n',
        encoding="utf-8",
    )
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    assert cfg.live_events_dir == (tmp_path / "data" / "live" / "events").resolve()
    assert cfg.remote_enabled is True


def test_remote未設定なら無効かつ既定パス(tmp_path: pathlib.Path) -> None:
    """remote セクションが無い forge.yaml では strike 行を出さない（disabled）。"""
    (tmp_path / "forge.yaml").write_text("{}\n", encoding="utf-8")
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    assert cfg.remote_enabled is False
    assert cfg.live_events_dir == (tmp_path / "data" / "live" / "events").resolve()


def test_remote_enabledがfalseなら無効(tmp_path: pathlib.Path) -> None:
    (tmp_path / "forge.yaml").write_text("remote:\n  enabled: false\n", encoding="utf-8")
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    assert cfg.remote_enabled is False


def test_local_events_pathの絶対指定をそのまま使う(tmp_path: pathlib.Path) -> None:
    events = tmp_path / "elsewhere" / "events"
    (tmp_path / "forge.yaml").write_text(
        f'remote:\n  enabled: true\n  local_events_path: "{events}"\n', encoding="utf-8"
    )
    cfg = ForgeConfig.from_forge_dir(tmp_path)
    assert cfg.live_events_dir == events.resolve()
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_forge_config.py -k "remote or local_events" -v`
Expected: FAIL — `AttributeError: 'ForgeConfig' object has no attribute 'live_events_dir'`

- [ ] **Step 3: 実装する**

`forge_config.py` のフィールド定義（`historical_dir` の直後、`config_path` の前）に追加:

```python
    historical_dir: pathlib.Path
    # alpha-strike が書き、`alpha-forge live sync-events` が rsync で降ろす
    # イベントログの**ローカル側**ディレクトリ。バージョン表示は同期済みの
    # `_meta.json` をここから読む（設計 §4）
    live_events_dir: pathlib.Path
    # forge.yaml の `remote.enabled`。false のとき strike は照会対象外
    remote_enabled: bool
```

`from_forge_dir` の `historical_dir` 解決の直後に追加:

```python
        remote = raw.get("remote") or {}
        # 既定を base（forge.yaml の親）基準にするのは、alpha-forge の
        # sync-events が local_events_path 未設定時に "./data/live/events" を
        # 使うため。ここを forge_dir 基準にすると、別置き forge.yaml 運用で
        # 同期先と参照先が食い違い、画面が静かに「未同期」になる
        live_events_dir = _resolve_path(
            base,
            remote.get("local_events_path"),
            default=base / "data" / "live" / "events",
        )
        remote_enabled = bool(remote.get("enabled", False))
```

`return cls(...)` に 2 つを追加:

```python
            historical_dir=historical_dir,
            live_events_dir=live_events_dir,
            remote_enabled=remote_enabled,
            config_path=yaml_path,
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/ -q && uv run ruff check src/ tests/ && uv run mypy`
Expected: 全 PASS（`ForgeConfig` を直接構築している既存テストがあれば新フィールド追加でエラーになる。その場合は該当テストにも新フィールドを渡して修正する）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/forge_config.py tests/test_forge_config.py
git commit -m "feat: ForgeConfig に live_events_dir と remote_enabled を追加"
```

---

### Task 3: `GET /api/versions`（照会のみ）

**Files:**
- Create: `src/alpha_visualizer/schemas/versions.py`
- Create: `src/alpha_visualizer/routers/versions.py`
- Modify: `src/alpha_visualizer/app.py`（import 追加・`include_router` 追加）
- Test: `tests/routers/test_versions.py`

**Interfaces:**
- Consumes: `fetch_latest_version` / `is_newer`（Task 1）、`ForgeConfig.live_events_dir` / `.remote_enabled`（Task 2）、既存の `run_forge_json(argv, forge_cfg, timeout) -> dict`
- Produces:
  - `schemas.versions.ComponentVersion` / `VersionsResponse`
  - `routers.versions.router`（prefix はアプリ側で `/api`）
  - `routers.versions.STRIKE_META_FILENAME = "_meta.json"`
  - `routers.versions.WINDOWS_MANUAL_UPDATE_MESSAGE` / `STRIKE_NOT_SYNCED_MESSAGE`

- [ ] **Step 1: 失敗するテストを書く**

`tests/routers/test_versions.py`:

```python
"""GET /api/versions のテスト。

設計の要点:

- 3 コンポーネント（forge / visualizer / strike）を 1 レスポンスに集約
- 個別の照会失敗はそのコンポーネントだけ unknown にして 200 を維持する。
  1 つの失敗が他 2 つを巻き込まないことがこの設計の存在理由である
- strike は remote.enabled=false なら disabled、未同期なら unknown
- forge の latest 判定は forge 自身（self version --json）の結果をそのまま使う

forge 呼び出しは `routers.versions` 名前空間の `run_forge_json` を patch する
（実 PATH を見ると CLI の無い CI で結果が実行マシン依存になる）。
"""
from __future__ import annotations

import json
import pathlib
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer import __version__
from alpha_visualizer.app import create_app
from alpha_visualizer.errors import ExternalProcessError

FORGE_SELF_VERSION = {
    "current_version": "1.9.2",
    "latest_version": "1.9.3",
    "latest_url": "https://example.invalid/releases/v1.9.3",
    "update_available": True,
    "is_dev_build": False,
    "error": None,
}


def _components(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in payload["components"]}


@pytest.fixture()
def remote_workspace(tmp_path: pathlib.Path) -> pathlib.Path:
    """remote.enabled=true の workspace（strike を照会対象にする）。"""
    (tmp_path / "forge.yaml").write_text(
        "remote:\n"
        "  enabled: true\n"
        '  local_events_path: "./data/live/events"\n',
        encoding="utf-8",
    )
    return tmp_path


def _write_strike_meta(root: pathlib.Path, payload: dict[str, Any]) -> None:
    events = root / "data" / "live" / "events"
    events.mkdir(parents=True, exist_ok=True)
    (events / "_meta.json").write_text(json.dumps(payload), encoding="utf-8")


def test_3コンポーネントが揃って返る(remote_workspace: pathlib.Path) -> None:
    _write_strike_meta(
        remote_workspace,
        {"component": "alpha-strike", "version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"},
    )
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version",
            side_effect=lambda pkg: {"alpha-visualizer": "9.9.9", "alpha-strike": "1.0.5"}[pkg],
        ),
    ):
        res = client.get("/api/versions")
    assert res.status_code == 200
    comps = _components(res.json())

    assert comps["forge"]["status"] == "ok"
    assert comps["forge"]["current"] == "1.9.2"
    assert comps["forge"]["latest"] == "1.9.3"
    assert comps["forge"]["update_available"] is True

    assert comps["visualizer"]["current"] == __version__
    assert comps["visualizer"]["latest"] == "9.9.9"
    assert comps["visualizer"]["update_available"] is True

    assert comps["strike"]["status"] == "ok"
    assert comps["strike"]["current"] == "1.0.4"
    assert comps["strike"]["update_available"] is True
    assert comps["strike"]["updatable"] is False
    assert comps["strike"]["as_of"] == "2026-08-10T09:12:00+09:00"


def test_forgeの失敗は他2つを巻き込まない(remote_workspace: pathlib.Path) -> None:
    """degraded 設計の核。forge が落ちても visualizer / strike は ok のまま。"""
    _write_strike_meta(remote_workspace, {"version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"})
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            side_effect=ExternalProcessError("forge が異常終了しました"),
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version",
            side_effect=lambda pkg: {"alpha-visualizer": "9.9.9", "alpha-strike": "1.0.5"}[pkg],
        ),
    ):
        res = client.get("/api/versions")
    assert res.status_code == 200
    comps = _components(res.json())
    assert comps["forge"]["status"] == "unknown"
    assert comps["forge"]["current"] is None
    assert comps["visualizer"]["status"] == "ok"
    assert comps["strike"]["status"] == "ok"


def test_PyPI取得失敗でもcurrentは維持される(remote_workspace: pathlib.Path) -> None:
    _write_strike_meta(remote_workspace, {"version": "1.0.4", "started_at": None})
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value=None
        ),
    ):
        res = client.get("/api/versions")
    comps = _components(res.json())
    assert comps["visualizer"]["status"] == "ok"
    assert comps["visualizer"]["current"] == __version__
    assert comps["visualizer"]["latest"] is None
    assert comps["visualizer"]["update_available"] is False


def test_meta未同期のstrikeはunknownで案内を出す(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="1.0.5"
        ),
    ):
        res = client.get("/api/versions")
    strike = _components(res.json())["strike"]
    assert strike["status"] == "unknown"
    assert strike["current"] is None
    assert "sync-events" in (strike["message"] or "")


def test_meta破損時もunknownに落ちる(remote_workspace: pathlib.Path) -> None:
    events = remote_workspace / "data" / "live" / "events"
    events.mkdir(parents=True)
    (events / "_meta.json").write_text("{ broken", encoding="utf-8")
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="1.0.5"
        ),
    ):
        res = client.get("/api/versions")
    assert _components(res.json())["strike"]["status"] == "unknown"


def test_remote無効ならstrikeはdisabled(tmp_path: pathlib.Path) -> None:
    (tmp_path / "forge.yaml").write_text("{}\n", encoding="utf-8")
    client = TestClient(create_app(forge_dir=tmp_path))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value=None
        ),
    ):
        res = client.get("/api/versions")
    assert _components(res.json())["strike"]["status"] == "disabled"


def test_Windowsではvisualizerがupdatable_false(remote_workspace: pathlib.Path) -> None:
    """実行中の alpha-vis.exe をロックしたまま pip が置換できないため。"""
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "win32"),
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="9.9.9"
        ),
    ):
        res = client.get("/api/versions")
    vis = _components(res.json())["visualizer"]
    assert vis["updatable"] is False
    assert vis["message"] is not None
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/routers/test_versions.py -v`
Expected: FAIL — `assert 404 == 200`（ルーター未登録）

- [ ] **Step 3: スキーマを実装する**

`src/alpha_visualizer/schemas/versions.py`:

```python
"""``GET /api/versions`` のレスポンススキーマ。

3 コンポーネント（forge / visualizer / strike）の現在版・最新版を集約する。
各コンポーネントは 3 状態:

- ``ok``: 現在版が取得できた
- ``unknown``: 取得できなかった（CLI 未導入・timeout・未同期・PyPI 到達不可）
- ``disabled``: 対象外（strike で ``remote.enabled: false``）

``updatable`` は「GUI から更新できるか」。strike は常に False（稼働中の
発注サーバーを GUI から再起動させない）。visualizer は Windows で False。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

VersionComponentId = Literal["forge", "visualizer", "strike"]
VersionCheckStatus = Literal["ok", "unknown", "disabled"]


class ComponentVersion(BaseModel):
    id: VersionComponentId
    status: VersionCheckStatus
    current: str | None = None
    latest: str | None = None
    update_available: bool = False
    updatable: bool = False
    #: unknown / 更新不可の理由と次の一歩（日英併記）
    message: str | None = None
    #: strike 専用。current が「いつ時点の値か」（最終同期時刻）。他は常に None
    as_of: str | None = None


class VersionsResponse(BaseModel):
    components: list[ComponentVersion]
```

- [ ] **Step 4: ルーターを実装する**

`src/alpha_visualizer/routers/versions.py`:

```python
"""バージョン照会 API ルーター。

``GET /api/versions`` — alpha-forge / alpha-visualizer / alpha-strike の現在版と
最新版を 1 レスポンスへ集約する（メンテナンス画面のバージョンセクション用）。

設計の要点:

- 照会は並列（``asyncio.gather``）。直列だと 1 つの timeout で画面表示が
  数十秒ブロックされる
- 個別の失敗はそのコンポーネントだけ ``unknown`` にして 200 を維持する。
  初回セットアップ中やオフラインではむしろ失敗が正常系
- forge の最新版判定は ``self version --json`` の結果をそのまま採用する。
  GitHub Releases の照会先・dev build 判定を visualizer 側に再実装すると、
  forge のリリース方式が変わったときに 2 か所がずれる
- strike は SSH で取りに行かない。同期済み ``_meta.json`` を読む。
  oracle-strike への SSH は Cloudflare Access 経由で、セッション切れ時に
  cloudflared がブラウザを開いて認証を要求するため、画面表示のたびに
  ブラウザが開いてしまう（設計 §3）

設計: docs/superpowers/specs/2026-08-10-tool-versions-design.md
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import sys
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from alpha_visualizer import __version__
from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.versions import ComponentVersion, VersionsResponse
from alpha_visualizer.services.forge_sync import run_forge_json
from alpha_visualizer.services.pypi import fetch_latest_version, is_newer

router = APIRouter()

#: forge CLI 1 呼び出しの上限。self version は GitHub Releases を見るため
#: ネットワーク待ちが乗る
FORGE_TIMEOUT_SEC = 60

#: alpha-strike が起動時に events ディレクトリへ書き、sync-events の rsync で
#: 降りてくるメタファイル。`.jsonl` ではないためイベント走査には混ざらない
STRIKE_META_FILENAME = "_meta.json"

VISUALIZER_PACKAGE = "alpha-visualizer"
STRIKE_PACKAGE = "alpha-strike"

FORGE_UNKNOWN_MESSAGE = (
    "alpha-forge のバージョンを取得できませんでした（未導入または実行に失敗）"
    " / Could not read the alpha-forge version (not installed, or the command failed)"
)

STRIKE_NOT_SYNCED_MESSAGE = (
    "`alpha-forge live sync-events` を実行すると alpha-strike のバージョンが表示されます"
    " / Run `alpha-forge live sync-events` to show the alpha-strike version"
)

WINDOWS_MANUAL_UPDATE_MESSAGE = (
    "Windows では実行中のプロセスを置き換えられないため、"
    "`pip install -U alpha-visualizer` を実行してから再起動してください"
    " / On Windows the running process cannot be replaced."
    " Run `pip install -U alpha-visualizer`, then restart."
)


async def _forge_self_version(forge_cfg: ForgeConfig) -> dict[str, Any] | None:
    """``self version --json`` を叩く。失敗は None（degraded）。"""
    try:
        return await asyncio.to_thread(
            run_forge_json, ["self", "version", "--json"], forge_cfg, FORGE_TIMEOUT_SEC
        )
    except Exception:  # noqa: BLE001 — degraded 設計: 失敗は unknown に落とす
        return None


def _read_strike_meta(events_dir: pathlib.Path) -> dict[str, Any] | None:
    """同期済み ``_meta.json`` を読む。不在・破損は None。"""
    path = events_dir / STRIKE_META_FILENAME
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def _forge_component(payload: dict[str, Any] | None) -> ComponentVersion:
    if payload is None:
        return ComponentVersion(
            id="forge", status="unknown", updatable=False, message=FORGE_UNKNOWN_MESSAGE
        )
    current = payload.get("current_version")
    if not isinstance(current, str):
        return ComponentVersion(
            id="forge", status="unknown", updatable=False, message=FORGE_UNKNOWN_MESSAGE
        )
    latest = payload.get("latest_version")
    return ComponentVersion(
        id="forge",
        status="ok",
        current=current,
        latest=latest if isinstance(latest, str) else None,
        update_available=bool(payload.get("update_available", False)),
        updatable=True,
    )


def _visualizer_component(latest: str | None) -> ComponentVersion:
    updatable = sys.platform != "win32"
    return ComponentVersion(
        id="visualizer",
        status="ok",
        current=__version__,
        latest=latest,
        update_available=bool(latest and is_newer(latest, __version__)),
        updatable=updatable,
        message=None if updatable else WINDOWS_MANUAL_UPDATE_MESSAGE,
    )


def _strike_component(
    forge_cfg: ForgeConfig, meta: dict[str, Any] | None, latest: str | None
) -> ComponentVersion:
    if not forge_cfg.remote_enabled:
        return ComponentVersion(id="strike", status="disabled", updatable=False)
    current = meta.get("version") if meta is not None else None
    if not isinstance(current, str):
        return ComponentVersion(
            id="strike",
            status="unknown",
            latest=latest,
            updatable=False,
            message=STRIKE_NOT_SYNCED_MESSAGE,
        )
    as_of = meta.get("started_at") if meta is not None else None
    return ComponentVersion(
        id="strike",
        status="ok",
        current=current,
        latest=latest,
        update_available=bool(latest and is_newer(latest, current)),
        # 稼働中の発注サーバーを GUI から更新・再起動させない（設計 非ゴール）
        updatable=False,
        as_of=as_of if isinstance(as_of, str) else None,
    )


@router.get("/versions", response_model=VersionsResponse)
async def get_versions(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> VersionsResponse:
    forge_payload, vis_latest, strike_latest, strike_meta = await asyncio.gather(
        _forge_self_version(forge_cfg),
        asyncio.to_thread(fetch_latest_version, VISUALIZER_PACKAGE),
        asyncio.to_thread(fetch_latest_version, STRIKE_PACKAGE),
        asyncio.to_thread(_read_strike_meta, forge_cfg.live_events_dir),
    )
    return VersionsResponse(
        components=[
            _forge_component(forge_payload),
            _visualizer_component(vis_latest),
            _strike_component(forge_cfg, strike_meta, strike_latest),
        ]
    )


__all__ = ["router"]
```

- [ ] **Step 5: `app.py` にルーターを登録する**

import 群（`from alpha_visualizer.routers import ...` の並び。アルファベット順で `strategies` の後・`wfo` の前）に追加:

```python
from alpha_visualizer.routers import versions as versions_router
```

既存の `include_router` 呼び出しが並ぶ箇所に、同じ書式で追加する（`setup_router` の登録行を探し、その近くに置く）:

```python
    app.include_router(versions_router.router, prefix="/api", tags=["versions"])
```

- [ ] **Step 6: テストが通ることを確認**

Run: `uv run pytest tests/routers/test_versions.py -v && uv run ruff check src/ tests/ && uv run mypy`
Expected: 全 PASS

- [ ] **Step 7: OpenAPI と TS 型を再生成する**

```bash
cd frontend && pnpm run gen
```

- [ ] **Step 8: コミット**

```bash
git add src/alpha_visualizer/schemas/versions.py src/alpha_visualizer/routers/versions.py \
        src/alpha_visualizer/app.py tests/routers/test_versions.py \
        frontend/openapi.json frontend/src/api/types.gen.ts
git commit -m "feat: GET /api/versions で3コンポーネントのバージョンを集約する"
```

---

### Task 4: フロント — バージョン表示（読み取りのみ）

**Files:**
- Modify: `frontend/src/api/types.ts`（alias 追加）
- Modify: `frontend/src/api/client.ts`（`getVersions` 追加）
- Create: `frontend/src/hooks/useVersions.ts`
- Create: `frontend/src/components/maintenance/VersionsPanel.tsx`
- Modify: `frontend/src/screens/MaintenanceScreen.tsx`
- Modify: `frontend/src/pages/MaintenancePage.tsx`
- Test: `frontend/src/hooks/__tests__/useVersions.test.tsx`
- Test: `frontend/src/components/maintenance/__tests__/VersionsPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/versions`（Task 3）、生成型 `components['schemas']['VersionsResponse']`
- Produces:
  - `api.getVersions(): Promise<VersionsResponse>`
  - `useVersions(): { components: ComponentVersion[]; loading: boolean; error: string | null; reload: () => Promise<void> }`
  - `<VersionsPanel components={...} loading={...} error={...} lang={...} />`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/maintenance/__tests__/VersionsPanel.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VersionsPanel } from '../VersionsPanel'
import type { ComponentVersion } from '../../../api/types'

const forgeOutdated: ComponentVersion = {
  id: 'forge', status: 'ok', current: '1.9.2', latest: '1.9.3',
  update_available: true, updatable: true, message: null, as_of: null,
}
const visLatest: ComponentVersion = {
  id: 'visualizer', status: 'ok', current: '1.6.0', latest: '1.6.0',
  update_available: false, updatable: true, message: null, as_of: null,
}
const strikeOk: ComponentVersion = {
  id: 'strike', status: 'ok', current: '1.0.4', latest: '1.0.5',
  update_available: true, updatable: false, message: null,
  as_of: '2026-08-10T09:12:00+09:00',
}
const strikeUnknown: ComponentVersion = {
  id: 'strike', status: 'unknown', current: null, latest: '1.0.5',
  update_available: false, updatable: false,
  message: '`alpha-forge live sync-events` を実行すると…', as_of: null,
}
const strikeDisabled: ComponentVersion = {
  id: 'strike', status: 'disabled', current: null, latest: null,
  update_available: false, updatable: false, message: null, as_of: null,
}

describe('VersionsPanel', () => {
  it('現在版と最新版を並べて表示する', () => {
    render(<VersionsPanel components={[forgeOutdated, visLatest]} loading={false} error={null} lang="ja" />)
    expect(screen.getByText('1.9.2')).toBeInTheDocument()
    expect(screen.getByText('1.9.3')).toBeInTheDocument()
  })

  it('disabled のコンポーネントは行ごと表示しない', () => {
    render(<VersionsPanel components={[visLatest, strikeDisabled]} loading={false} error={null} lang="ja" />)
    expect(screen.queryByText('alpha-strike')).not.toBeInTheDocument()
  })

  it('unknown は「不明」と message を出す', () => {
    render(<VersionsPanel components={[strikeUnknown]} loading={false} error={null} lang="ja" />)
    expect(screen.getByText(/不明/)).toBeInTheDocument()
    expect(screen.getByText(/sync-events/)).toBeInTheDocument()
  })

  it('strike は current が最終同期時点であることを as_of で示す', () => {
    // リアルタイム値だと誤認させないことが、この列の存在理由
    render(<VersionsPanel components={[strikeOk]} loading={false} error={null} lang="ja" />)
    expect(screen.getByText(/2026-08-10/)).toBeInTheDocument()
  })
})
```

`frontend/src/hooks/__tests__/useVersions.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useVersions } from '../useVersions'
import { api } from '../../api/client'

describe('useVersions', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('マウント時に取得して components を返す', async () => {
    vi.spyOn(api, 'getVersions').mockResolvedValue({
      components: [
        { id: 'forge', status: 'ok', current: '1.9.2', latest: '1.9.3', update_available: true, updatable: true, message: null, as_of: null },
      ],
    })
    const { result } = renderHook(() => useVersions())
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    expect(result.current.components).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('取得失敗は error に入れて loading を解除する', async () => {
    vi.spyOn(api, 'getVersions').mockRejectedValue(new Error('API 503: forge cli not found'))
    const { result } = renderHook(() => useVersions())
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    expect(result.current.error).toContain('503')
    expect(result.current.components).toEqual([])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useVersions.test.tsx src/components/maintenance/__tests__/VersionsPanel.test.tsx`
Expected: FAIL — モジュール `../useVersions` / `../VersionsPanel` が解決できない

- [ ] **Step 3: 型 alias と API クライアントを追加する**

`frontend/src/api/types.ts` の「生成型 alias」節に追加:

```ts
export type VersionsResponse = S['VersionsResponse']
export type ComponentVersion = S['ComponentVersion']
```

`frontend/src/api/client.ts`：1 行目の import 型リストに `ComponentVersion` は不要（`VersionsResponse` のみ）。`VersionsResponse` をアルファベット順の位置へ足したうえで、`listOrphanRuns` の直前に追加:

```ts
  // 各種ツールのバージョン照会（/maintenance 画面のバージョンセクション）
  getVersions: (): Promise<VersionsResponse> => request<VersionsResponse>('/versions'),
```

- [ ] **Step 4: hook を実装する**

`frontend/src/hooks/useVersions.ts`:

```ts
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ComponentVersion } from '../api/types'

export interface UseVersionsState {
  components: ComponentVersion[]
  loading: boolean
  error: string | null
  /** 更新完了後などに一覧を取り直す。 */
  reload: () => Promise<void>
}

/**
 * 各種ツールのバージョン一覧を取得する hook。`MaintenancePage` から使う。
 *
 * サーバー側で個別の失敗は `unknown` に落ちて 200 が返るため、ここでの
 * `error` は API 呼び出し自体が失敗したときだけ立つ。
 */
export function useVersions(): UseVersionsState {
  const [components, setComponents] = useState<ComponentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 初回マウント時の取得。effect 本体で同期的に setState しない書き方を
  // 他 hook（useOrphanRuns 等）と揃える
  useEffect(() => {
    let cancelled = false
    api.getVersions()
      .then(data => {
        if (cancelled) return
        setComponents(data.components)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await api.getVersions()
      setComponents(data.components)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return { components, loading, error, reload }
}
```

- [ ] **Step 5: `VersionsPanel` を実装する**

`frontend/src/components/maintenance/VersionsPanel.tsx`:

```tsx
import type { CSSProperties, ReactElement } from 'react'
import type { ComponentVersion } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { fmtDate } from '../../lib/format'
import { ErrorBanner, Loading } from '../../design/primitives'

export interface VersionsPanelProps {
  components: ComponentVersion[]
  loading: boolean
  error: string | null
  lang: Lang
}

/** API は短い id を返し、表示名はフロントで決める。 */
const DISPLAY_NAME: Record<ComponentVersion['id'], string> = {
  forge: 'alpha-forge',
  visualizer: 'alpha-visualizer',
  strike: 'alpha-strike',
}

// browser ドメイン外のテーブルはローカル定義するのがこのコードベースの流儀
// （MaintenanceScreen.tsx:48-51 のコメントと同じ理由で、この画面の都合で
// 変更されて他画面が巻き添えを食わないようここに持つ）。
const TH_BASE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  padding: '10px 12px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  color: 'var(--text3)',
}

const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  padding: '8px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  letterSpacing: 'var(--tracking-mono)',
}

const NOTE_STYLE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  color: 'var(--text3)',
  marginTop: 4,
}

/**
 * 各種ツールのバージョン一覧。
 *
 * `disabled`（remote 無効の alpha-strike）は行ごと出さない。使っていない
 * 連携先を「不明」として並べても、ユーザーには対応すべき問題に見えるだけ。
 */
export function VersionsPanel({
  components,
  loading,
  error,
  lang,
}: VersionsPanelProps): ReactElement {
  const l = makeL(lang)
  const rows = components.filter(c => c.status !== 'disabled')

  if (error) {
    return <ErrorBanner message={error} retryLabel={l('再試行', 'Retry')} title={error} />
  }
  if (loading) {
    return <Loading label={l('バージョンを確認しています…', 'Checking versions…')} rows={3} />
  }

  return (
    <section data-testid="versions-panel">
      <h2>{l('バージョン', 'Versions')}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH_BASE}>{l('ツール', 'Tool')}</th>
            <th style={TH_BASE}>{l('現在', 'Current')}</th>
            <th style={TH_BASE}>{l('最新', 'Latest')}</th>
            <th style={TH_BASE}>{l('状態', 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td style={TD_BASE}>{DISPLAY_NAME[c.id]}</td>
              <td style={TD_BASE}>
                {c.status === 'ok' ? c.current : l('不明', 'Unknown')}
                {/* strike の current は最終同期時点の値。リアルタイムだと
                    誤認させないため、この注記は必ず併記する */}
                {c.as_of ? (
                  <div style={NOTE_STYLE}>
                    {l('最終同期', 'Last synced')}: {fmtDate(c.as_of)}
                  </div>
                ) : null}
              </td>
              <td
                style={{
                  ...TD_BASE,
                  fontWeight: c.update_available ? 700 : 400,
                }}
              >
                {c.latest ?? '—'}
              </td>
              <td style={TD_BASE}>
                {c.update_available
                  ? l('更新があります', 'Update available')
                  : c.status === 'ok'
                    ? l('最新', 'Up to date')
                    : l('不明', 'Unknown')}
                {c.message ? <div style={NOTE_STYLE}>{c.message}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

> 見出し（`<h2>`）のスタイルは `MaintenanceScreen.tsx` の既存見出しに合わせること。
> 同ファイルの見出し要素をそのまま参考にし、独自のフォント指定を増やさない。

- [ ] **Step 6: `MaintenanceScreen` と `MaintenancePage` に接続する**

`MaintenanceScreenProps` に 4 つ足す:

```ts
  versions: ComponentVersion[]
  versionsLoading: boolean
  versionsError: string | null
```

`MaintenanceScreen` の描画で、孤児削除セクションの**上**に置く:

```tsx
<VersionsPanel
  components={versions}
  loading={versionsLoading}
  error={versionsError}
  lang={lang}
/>
```

`MaintenancePage` で `useVersions()` を呼び、上記 props を渡す。

- [ ] **Step 7: テストが通ることを確認**

Run: `cd frontend && pnpm vitest run && pnpm run lint && pnpm run build`
Expected: 全 PASS、lint / build ともエラーなし

- [ ] **Step 8: コミット**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts \
        frontend/src/hooks/useVersions.ts frontend/src/hooks/__tests__/useVersions.test.tsx \
        frontend/src/components/maintenance/ \
        frontend/src/screens/MaintenanceScreen.tsx frontend/src/pages/MaintenancePage.tsx
git commit -m "feat: メンテナンス画面にバージョンセクションを追加する"
```

---

### Task 5: alpha-forge の更新ジョブ

**Files:**
- Modify: `src/alpha_visualizer/services/jobs.py:69-74`（`JobKind` 追加）・`:210-218` 付近（argv ビルダ追加）・`:645-677`（`_execute` 分岐）
- Modify: `src/alpha_visualizer/routers/versions.py`（`POST /api/versions/forge/update`）
- Test: `tests/services/test_jobs.py`（argv ビルダ）
- Test: `tests/routers/test_versions.py`（エンドポイント）

**Interfaces:**
- Consumes: 既存 `JobManager.create(kind=..., strategy_id="", symbol="") -> JobRecord`、`routers.jobs._to_summary(record) -> JobSummary`
- Produces:
  - `services.jobs.build_self_update_argv(forge_exe: str) -> list[str]`
  - `JobKind` に `"forge_self_update"` を追加
  - `POST /api/versions/forge/update` → 202 + `JobSummary`

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_jobs.py` に追記:

```python
def test_build_self_update_argvはyesを必ず付ける() -> None:
    """GUI からは対話プロンプトに応答できない。--yes が無いとジョブが固まる。"""
    from alpha_visualizer.services.jobs import build_self_update_argv

    assert build_self_update_argv("/usr/local/bin/alpha-forge") == [
        "/usr/local/bin/alpha-forge",
        "self",
        "update",
        "--yes",
    ]
```

`tests/routers/test_versions.py` に追記:

```python
def test_forge更新は202とジョブを返す(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.resolve_forge_exe",
            return_value="/usr/local/bin/alpha-forge",
        ),
        mock.patch(
            "alpha_visualizer.services.jobs.JobManager.create",
            new_callable=mock.AsyncMock,
        ) as create,
    ):
        create.return_value = _job_record("forge_self_update")
        res = client.post("/api/versions/forge/update")
    assert res.status_code == 202
    assert create.await_args.kwargs["kind"] == "forge_self_update"


def test_forge未導入なら503(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with mock.patch(
        "alpha_visualizer.routers.versions.resolve_forge_exe", return_value=None
    ):
        res = client.post("/api/versions/forge/update")
    assert res.status_code == 503


def test_strikeの更新は400(remote_workspace: pathlib.Path) -> None:
    """稼働中の発注サーバーを GUI から更新させない（設計 非ゴール）。"""
    client = TestClient(create_app(forge_dir=remote_workspace))
    res = client.post("/api/versions/strike/update")
    assert res.status_code == 400


def test_非loopback公開時は403(remote_workspace: pathlib.Path) -> None:
    """パッケージ更新は書き込み系ローカル限定機能（data / pine と同じ方針）。"""
    app = create_app(forge_dir=remote_workspace, local_write_enabled=False)
    client = TestClient(app)
    res = client.post("/api/versions/forge/update")
    assert res.status_code == 403
```

テストファイル冒頭に `_job_record` ヘルパを追加する（既存 `tests/routers/test_live_jobs.py` に同種のヘルパがあればそれに倣う。無ければ以下）:

```python
def _job_record(kind: str) -> Any:
    from datetime import UTC, datetime

    from alpha_visualizer.services.jobs import JobRecord

    return JobRecord(
        job_id="job-test000000",
        kind=kind,  # type: ignore[arg-type]
        strategy_id="",
        symbol="",
        created_at=datetime.now(UTC),
    )
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/routers/test_versions.py tests/services/test_jobs.py -k "self_update or forge更新 or strike の or 非loopback" -v`
Expected: FAIL — `ImportError: cannot import name 'build_self_update_argv'` / `assert 405 == 202`

- [ ] **Step 3: `jobs.py` を実装する**

`JobKind` に追加（`ForgeJobKind` には**足さない**。`build_argv` は 3 種専用のまま）:

```python
JobKind = Literal[
    "backtest", "optimize", "wft", "agent", "data_fetch", "data_update",
    "live_refresh", "forge_self_update",
]
```

`build_live_refresh_argv` の直後に追加:

```python
def build_self_update_argv(forge_exe: str) -> list[str]:
    """alpha-forge バイナリの自己更新 argv。

    ``--yes`` は必須。GUI からは対話プロンプトに応答できないため、
    付け忘れるとジョブが確認待ちのまま timeout まで固まる。
    ダウンロードの SHA256 検証・スモークテスト・ロールバックは forge 側が
    持っているので visualizer は何もしない。
    """
    return [forge_exe, "self", "update", "--yes"]
```

`_execute` の forge 分岐（`else:` 側）に、`live_refresh` の `elif` の隣として追加:

```python
            elif record.kind == "forge_self_update":
                argv = build_self_update_argv(forge_exe)
```

- [ ] **Step 4: ルーターにエンドポイントを追加する**

`routers/versions.py` に import を足す:

```python
from fastapi import APIRouter, Depends, Request

from alpha_visualizer.dependencies import get_forge_config_dep, get_job_manager
from alpha_visualizer.errors import (
    ForgeCliNotFoundError,
    InvalidRequestError,
    LocalWriteDisabledError,
)
from alpha_visualizer.routers.jobs import JobSummary, _to_summary
from alpha_visualizer.services.forge_cli import FORGE_NOT_FOUND_MESSAGE, resolve_forge_exe
from alpha_visualizer.services.jobs import JobManager
```

定数とエンドポイント:

```python
LOCAL_WRITE_DISABLED_MESSAGE = (
    "ツールの更新は localhost でのみ実行できます（LAN 公開中は無効）"
    " / Tool updates are only available on localhost"
)

STRIKE_NOT_UPDATABLE_MESSAGE = (
    "alpha-strike は GUI から更新できません（稼働中の発注サーバーを再起動しないため）。"
    "VM 上で更新手順を実行してください"
    " / alpha-strike cannot be updated from the GUI."
    " Run the update procedure on the VM."
)


@router.post("/versions/forge/update", response_model=JobSummary, status_code=202)
async def update_forge(
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """``alpha-forge self update --yes`` をジョブとして起動する。

    ゲートは既存の ``local_write_enabled`` を再利用する（routers/data.py・
    routers/pine.py と同じ方針）。パッケージ更新は「書き込み系ローカル限定
    機能」そのもので、新しいフラグを足す理由がない。
    """
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)
    # ジョブを積んでから失敗させず、起動前に fail-fast する（routers/live.py と同じ）
    if resolve_forge_exe() is None:
        raise ForgeCliNotFoundError(FORGE_NOT_FOUND_MESSAGE)
    record = await manager.create(kind="forge_self_update", strategy_id="", symbol="")
    return _to_summary(record)


@router.post("/versions/strike/update")
async def update_strike() -> None:
    """alpha-strike は GUI から更新しない（明示的に 400 で断る）。

    ルート自体を生やさず 404 にすると「まだ実装されていないのか、
    意図的に無いのか」がクライアントから区別できない。
    """
    raise InvalidRequestError(STRIKE_NOT_UPDATABLE_MESSAGE)
```

- [ ] **Step 5: テストが通ることを確認**

Run: `uv run pytest tests/ -q && uv run ruff check src/ tests/ && uv run mypy`
Expected: 全 PASS

- [ ] **Step 6: OpenAPI と TS 型を再生成する**

```bash
cd frontend && pnpm run gen
```

- [ ] **Step 7: コミット**

```bash
git add src/alpha_visualizer/services/jobs.py src/alpha_visualizer/routers/versions.py \
        tests/services/test_jobs.py tests/routers/test_versions.py \
        frontend/openapi.json frontend/src/api/types.gen.ts
git commit -m "feat: GUI から alpha-forge self update を実行できるようにする"
```

---

### Task 6: alpha-visualizer の自己更新ジョブ（再起動は次タスク）

**Files:**
- Create: `src/alpha_visualizer/services/self_update.py`
- Modify: `src/alpha_visualizer/services/jobs.py`（`JobKind` 追加・`_execute` 分岐）
- Modify: `src/alpha_visualizer/routers/versions.py`（`POST /api/versions/visualizer/update`）
- Test: `tests/services/test_self_update.py`
- Test: `tests/routers/test_versions.py`（追記）

**Interfaces:**
- Consumes: Task 5 で足した `JobKind` 拡張パターン
- Produces:
  - `services.self_update.PACKAGE_NAME = "alpha-visualizer"`
  - `services.self_update.is_editable_install() -> bool`
  - `services.self_update.build_upgrade_argv() -> list[str] | None`
  - `JobKind` に `"visualizer_self_update"` を追加
  - `POST /api/versions/visualizer/update` → 202 + `JobSummary`

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/test_self_update.py`:

```python
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

import pytest

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
```

`tests/routers/test_versions.py` に追記:

```python
def test_visualizer更新は202(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "linux"),
        mock.patch(
            "alpha_visualizer.routers.versions.is_editable_install", return_value=False
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.build_upgrade_argv",
            return_value=["python", "-m", "pip", "install", "-U", "alpha-visualizer"],
        ),
        mock.patch(
            "alpha_visualizer.services.jobs.JobManager.create", new_callable=mock.AsyncMock
        ) as create,
    ):
        create.return_value = _job_record("visualizer_self_update")
        res = client.post("/api/versions/visualizer/update")
    assert res.status_code == 202
    assert create.await_args.kwargs["kind"] == "visualizer_self_update"


def test_editableインストールは409(remote_workspace: pathlib.Path) -> None:
    """開発チェックアウトに pip install -U を打たせない。"""
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "linux"),
        mock.patch(
            "alpha_visualizer.routers.versions.is_editable_install", return_value=True
        ),
    ):
        res = client.post("/api/versions/visualizer/update")
    assert res.status_code == 409


def test_実行中ジョブがあれば409(remote_workspace: pathlib.Path) -> None:
    """バックテストやエージェントを巻き添えで殺さない。"""
    client = TestClient(create_app(forge_dir=remote_workspace))
    running = _job_record("backtest")
    running.status = "running"
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "linux"),
        mock.patch(
            "alpha_visualizer.routers.versions.is_editable_install", return_value=False
        ),
        mock.patch(
            "alpha_visualizer.services.jobs.JobManager.list", return_value=[running]
        ),
    ):
        res = client.post("/api/versions/visualizer/update")
    assert res.status_code == 409


def test_Windowsでは409(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with mock.patch("alpha_visualizer.routers.versions.sys.platform", "win32"):
        res = client.post("/api/versions/visualizer/update")
    assert res.status_code == 409


def test_インストーラが無ければ409(remote_workspace: pathlib.Path) -> None:
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "linux"),
        mock.patch(
            "alpha_visualizer.routers.versions.is_editable_install", return_value=False
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.build_upgrade_argv", return_value=None
        ),
    ):
        res = client.post("/api/versions/visualizer/update")
    assert res.status_code == 409
```

> 一覧取得は `JobManager.list() -> list[JobRecord]`（`services/jobs.py:361`）。
> `routers/jobs.py:171` の `GET /api/jobs` が使っているものと同じ。

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/services/test_self_update.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'alpha_visualizer.services.self_update'`

- [ ] **Step 3: `services/self_update.py` を実装する**

```python
"""alpha-visualizer 自身のパッケージ更新に関する可否判定とコマンド構築。

「実行中の自分自身を差し替える」操作なので、可否の判定（editable か・
pip / uv のどちらが使えるか）をこのモジュールへ集約し、ルーターと
JobManager は結果だけを見る。
"""
from __future__ import annotations

import importlib.metadata
import json
import shutil
import subprocess
import sys

PACKAGE_NAME = "alpha-visualizer"

#: `pip --version` の待ち上限。存在確認だけなので短くてよい
PIP_PROBE_TIMEOUT_SEC = 15

#: 更新手段が無いときの案内。ルーター（事前ガード）と JobManager（実行時の
#: 保険）の両方から参照するため、判定と同じ場所に 1 つだけ置く
NO_INSTALLER_MESSAGE = (
    "pip も uv も見つからないため更新できません。手動で"
    " `pip install -U alpha-visualizer` を実行してください"
    " / Neither pip nor uv is available."
    " Run `pip install -U alpha-visualizer` manually."
)


def is_editable_install() -> bool:
    """editable（開発チェックアウト）インストールかを判定する（PEP 610）。

    editable に ``pip install -U`` を打つと、作業中のソースツリーとは別に
    PyPI 版が入り込み、どちらが読まれているか分からない状態になる。

    判定できない場合は False（更新を許可）に倒す。``direct_url.json`` が
    読めないのは wheel でも editable でもない特殊な導入形態で、そこまで
    面倒は見ない。
    """
    try:
        raw = importlib.metadata.distribution(PACKAGE_NAME).read_text("direct_url.json")
    except importlib.metadata.PackageNotFoundError:
        return False
    if not raw:
        return False
    try:
        payload = json.loads(raw)
    except ValueError:
        return False
    if not isinstance(payload, dict):
        return False
    dir_info = payload.get("dir_info")
    return bool(isinstance(dir_info, dict) and dir_info.get("editable"))


def build_upgrade_argv() -> list[str] | None:
    """自己更新コマンドを組む。使えるインストーラが無ければ None。

    uv 製 venv には pip が入っていないことが多いため、pip が使えない場合は
    uv へフォールバックする。どちらも無い環境では更新を諦め、呼び出し側が
    手動コマンドを案内する（黙って何もしないより明示的に断る）。
    """
    if _has_pip():
        return [sys.executable, "-m", "pip", "install", "-U", PACKAGE_NAME]
    uv_exe = shutil.which("uv")
    if uv_exe is not None:
        return [uv_exe, "pip", "install", "--python", sys.executable, "-U", PACKAGE_NAME]
    return None


def _has_pip() -> bool:
    """現在のインタプリタで ``python -m pip`` が使えるか。"""
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True,
            timeout=PIP_PROBE_TIMEOUT_SEC,
            stdin=subprocess.DEVNULL,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return proc.returncode == 0
```

- [ ] **Step 4: `jobs.py` に kind を足す**

`JobKind` に `"visualizer_self_update"` を追加。`_execute` の分岐は **forge 解決より前**に置く（この kind は forge を必要としない）:

```python
        if record.kind == "agent":
            ...
        elif record.kind == "visualizer_self_update":
            # forge を介さない唯一のジョブ。pip / uv を直接起動する
            upgrade_argv = build_upgrade_argv()
            if upgrade_argv is None:
                await self._finish(record, "failed", error=NO_INSTALLER_MESSAGE)
                return
            argv = upgrade_argv
            timeout_sec = self._timeout_sec
        else:
            forge_exe = self._forge_resolver()
            ...
```

`jobs.py` の import に追加する（文言は定義箇所を 1 つに保つ）:

```python
from alpha_visualizer.services.self_update import NO_INSTALLER_MESSAGE, build_upgrade_argv
```

- [ ] **Step 5: ルーターにエンドポイントを追加する**

`routers/versions.py`:

```python
EDITABLE_INSTALL_MESSAGE = (
    "開発用（editable）インストールのため GUI からは更新できません。"
    "作業ツリーで git pull / uv sync を実行してください"
    " / This is an editable install; updating from the GUI is disabled."
    " Run git pull / uv sync in your working tree."
)

JOBS_RUNNING_MESSAGE = (
    "実行中のジョブがあるため更新できません。完了またはキャンセルしてから再試行してください"
    " / Cannot update while jobs are running. Wait for them to finish or cancel them."
)


@router.post("/versions/visualizer/update", response_model=JobSummary, status_code=202)
async def update_visualizer(
    request: Request,
    manager: Annotated[JobManager, Depends(get_job_manager)],
) -> JobSummary:
    """自分自身を pip / uv で更新するジョブを起動する。

    実行中プロセスを差し替えるため、事前ガードを 4 つ通す。1 つでも欠けたら
    ジョブを積まずに 409 で断る（積んでから失敗させると、原因がログの奥に
    埋まったうえに中途半端な状態が残りうる）。
    """
    if not request.app.state.local_write_enabled:
        raise LocalWriteDisabledError(LOCAL_WRITE_DISABLED_MESSAGE)
    if sys.platform == "win32":
        # 実行中の alpha-vis.exe がロックされ、pip がファイルを置換できない
        raise ConflictError(WINDOWS_MANUAL_UPDATE_MESSAGE)
    if is_editable_install():
        raise ConflictError(EDITABLE_INSTALL_MESSAGE)
    if _has_active_jobs(manager):
        raise ConflictError(JOBS_RUNNING_MESSAGE)
    if build_upgrade_argv() is None:
        raise ConflictError(NO_INSTALLER_MESSAGE)
    record = await manager.create(kind="visualizer_self_update", strategy_id="", symbol="")
    return _to_summary(record)
```

同じく `routers/versions.py` に薄いヘルパを置く:

```python
def _has_active_jobs(manager: JobManager) -> bool:
    """queued / running のジョブが 1 件でもあるか。

    自己更新は自プロセスを差し替えて再起動するため、走っているジョブは
    すべて道連れになる。バックテストやエージェントの実行中は更新を断る。
    """
    return any(record.status in ("queued", "running") for record in manager.list())
```

import に以下を追加する:

```python
from alpha_visualizer.errors import ConflictError
from alpha_visualizer.services.self_update import (
    NO_INSTALLER_MESSAGE,
    build_upgrade_argv,
    is_editable_install,
)
```

- [ ] **Step 6: テストが通ることを確認**

Run: `uv run pytest tests/ -q && uv run ruff check src/ tests/ && uv run mypy`
Expected: 全 PASS

- [ ] **Step 7: OpenAPI と TS 型を再生成してコミット**

```bash
cd frontend && pnpm run gen && cd ..
git add src/alpha_visualizer/services/self_update.py src/alpha_visualizer/services/jobs.py \
        src/alpha_visualizer/routers/versions.py tests/services/test_self_update.py \
        tests/routers/test_versions.py frontend/openapi.json frontend/src/api/types.gen.ts
git commit -m "feat: alpha-visualizer 自身を pip/uv で更新するジョブを追加"
```

---

### Task 7: 更新成功後の自動再起動

**Files:**
- Modify: `src/alpha_visualizer/app.py`（`restart_requested` / `uvicorn_server` の初期化）
- Modify: `src/alpha_visualizer/cli.py:242-256`（server の公開・`os.execv`）・ファイル末尾（`__main__` ガード）
- Modify: `src/alpha_visualizer/routers/versions.py`（成功監視タスク）
- Test: `tests/routers/test_versions.py`（監視タスク）
- Test: `tests/test_cli.py`（execv）

**Interfaces:**
- Consumes: `JobManager.wait_terminal(job_id: str, timeout: float) -> JobRecord`（既存）
- Produces:
  - `app.state.restart_requested: bool`（初期値 False）
  - `app.state.uvicorn_server`（cli.py が代入。テストでは None のまま）
  - `routers.versions._restart_after_success(app, manager, job_id) -> None`

- [ ] **Step 1: 失敗するテストを書く**

`tests/routers/test_versions.py` に追記:

```python
def test_更新成功時のみ再起動を要求する(tmp_path: pathlib.Path) -> None:
    """壊れたまま再起動して二度と起動しない事態を避ける（設計 §エラー処理）。"""
    import asyncio

    from alpha_visualizer.routers.versions import _restart_after_success

    app = create_app(forge_dir=tmp_path)
    server = mock.Mock()
    server.should_exit = False
    app.state.uvicorn_server = server

    succeeded = _job_record("visualizer_self_update")
    succeeded.status = "succeeded"
    manager = mock.Mock()
    manager.wait_terminal = mock.AsyncMock(return_value=succeeded)

    asyncio.run(_restart_after_success(app, manager, "job-test000000"))
    assert app.state.restart_requested is True
    assert server.should_exit is True


def test_更新失敗時は再起動しない(tmp_path: pathlib.Path) -> None:
    import asyncio

    from alpha_visualizer.routers.versions import _restart_after_success

    app = create_app(forge_dir=tmp_path)
    server = mock.Mock()
    server.should_exit = False
    app.state.uvicorn_server = server

    failed = _job_record("visualizer_self_update")
    failed.status = "failed"
    manager = mock.Mock()
    manager.wait_terminal = mock.AsyncMock(return_value=failed)

    asyncio.run(_restart_after_success(app, manager, "job-test000000"))
    assert app.state.restart_requested is False
    assert server.should_exit is False
```

`tests/test_cli.py` に追記:

```python
def _free_port() -> int:
    """OS から空きポートを 1 つもらう。

    既定の 8000 は開発中の `alpha-vis serve` が掴んでいることがあり、
    `_ensure_port_available` が発火して serve テストが落ちる。既存の serve
    テストが抱えているこのローカル依存を、新規テストへ持ち込まない。
    """
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_restart_requestedならexecvで再起動する(tmp_path: pathlib.Path) -> None:
    """更新後の再起動は server.run() が戻った後（= ソケット解放後）に行う。
    先に exec するとポート再バインドが EADDRINUSE で落ちる。
    """
    import sys
    from unittest import mock

    from click.testing import CliRunner

    from alpha_visualizer.cli import cli

    class _FakeServer:
        def __init__(self, config: object) -> None:
            self.config = config
            self.should_exit = False

        def run(self) -> None:
            # 更新ジョブ成功後の状態を再現する
            self.config.app.state.restart_requested = True  # type: ignore[attr-defined]

    with (
        mock.patch("uvicorn.Server", _FakeServer),
        mock.patch("alpha_visualizer.cli.os.execv") as execv,
    ):
        result = CliRunner().invoke(
            cli,
            ["serve", "--forge-dir", str(tmp_path), "--no-open", "--port", str(_free_port())],
        )
    assert result.exit_code == 0
    execv.assert_called_once()
    args = execv.call_args.args
    assert args[0] == sys.executable
    assert args[1][:3] == [sys.executable, "-m", "alpha_visualizer.cli"]


def test_restart_requestedでなければexecvしない(tmp_path: pathlib.Path) -> None:
    from unittest import mock

    from click.testing import CliRunner

    from alpha_visualizer.cli import cli

    class _FakeServer:
        def __init__(self, config: object) -> None:
            self.config = config
            self.should_exit = False

        def run(self) -> None:
            return None

    with (
        mock.patch("uvicorn.Server", _FakeServer),
        mock.patch("alpha_visualizer.cli.os.execv") as execv,
    ):
        result = CliRunner().invoke(
            cli,
            ["serve", "--forge-dir", str(tmp_path), "--no-open", "--port", str(_free_port())],
        )
    assert result.exit_code == 0
    execv.assert_not_called()
```

> `pytest-asyncio` は dev 依存に入っていない（既存の async テストは
> `tests/services/test_jobs.py` のように `pytestmark = pytest.mark.anyio` ＋
> `anyio_backend` フィクスチャを使う）。`test_versions.py` は同期テストの
> ファイルなので、モジュール全体に anyio マークを付けず `asyncio.run(...)` で
> 呼ぶ上記の書き方にする。

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_cli.py -k restart -v`
Expected: FAIL — `AttributeError: <module 'alpha_visualizer.cli'> does not have the attribute 'os'`

- [ ] **Step 3: `app.py` に state を追加する**

`app.state.local_write_enabled = local_write_enabled` の直後:

```python
    # 自己更新後の再起動フラグ。cli.py が server.run() から戻った後に見る。
    # exec は必ず uvicorn 停止後（= ソケット解放後）に行う（設計 §6）
    app.state.restart_requested = False
    # cli.py が uvicorn.Server を代入する。テスト（TestClient）では None のまま
    app.state.uvicorn_server = None
    # 更新ジョブの成功監視タスクの保持先（GC 回収を防ぐ）
    app.state.restart_watcher = None
```

- [ ] **Step 4: `cli.py` を実装する**

ファイル冒頭の import に `os` と `sys` を追加（既存の import 群に合流させる）。

`server = uvicorn.Server(uv_config)` の直後:

```python
    # 自己更新後の graceful shutdown をルーターから要求できるようにする。
    # 実際の exec は server.run() が戻った後（下）で行う
    app.state.uvicorn_server = server
```

`server.run()` の直後、既存の停止メッセージの**前**:

```python
    if app.state.restart_requested:
        click.echo(
            "更新を反映するため alpha-vis serve を再起動します。"
            " / Restarting alpha-vis serve to apply the update."
        )
        # ここで exec すればソケットは解放済みで、再バインドが EADDRINUSE で
        # 落ちない。起動方法（alpha-vis / uv run / python -m）に依らず
        # 同じ経路になるよう -m で起動し直す
        os.execv(sys.executable, [sys.executable, "-m", "alpha_visualizer.cli", *sys.argv[1:]])
    click.echo("alpha-vis serve を停止しました。 / alpha-vis serve stopped.")
```

ファイル末尾:

```python
if __name__ == "__main__":  # pragma: no cover - python -m alpha_visualizer.cli 用
    cli()
```

- [ ] **Step 5: ルーターに監視タスクを追加する**

`routers/versions.py`:

```python
#: 更新ジョブの終了を待つ上限。pip の依存解決が遅い環境でも足りる長さにし、
#: これを超えたら再起動を諦める（フラグを立てたまま放置しない）
RESTART_WATCH_TIMEOUT_SEC = 1800


async def _restart_after_success(app: Any, manager: JobManager, job_id: str) -> None:
    """更新ジョブが成功したときだけ再起動を要求する。

    失敗したまま再起動すると、壊れた環境で二度と起動しない事態になりうる。
    再起動は成功パスにのみ紐づける（設計 §エラー処理の最重要行）。
    """
    try:
        record = await manager.wait_terminal(job_id, timeout=RESTART_WATCH_TIMEOUT_SEC)
    except TimeoutError:
        return
    if record.status != "succeeded":
        return
    app.state.restart_requested = True
    server = app.state.uvicorn_server
    if server is not None:
        server.should_exit = True
```

`update_visualizer` の `return` 直前に監視タスクの起動を追加:

```python
    record = await manager.create(kind="visualizer_self_update", strategy_id="", symbol="")
    # 成功監視はレスポンスを待たせない（更新は数分かかりうる）。
    # 参照を app.state に持たせないと、実行中のタスクが GC で消えうる
    request.app.state.restart_watcher = asyncio.create_task(
        _restart_after_success(request.app, manager, record.job_id)
    )
    return _to_summary(record)
```

- [ ] **Step 6: テストが通ることを確認**

Run: `uv run pytest tests/ -q && uv run ruff check src/ tests/ && uv run mypy`
Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
git add src/alpha_visualizer/app.py src/alpha_visualizer/cli.py \
        src/alpha_visualizer/routers/versions.py tests/test_cli.py tests/routers/test_versions.py
git commit -m "feat: 自己更新が成功したときだけサーバーを再起動する"
```

---

### Task 8: フロント — 更新ボタンと再起動待ち

**Files:**
- Modify: `frontend/src/api/client.ts`（`startComponentUpdate` 追加）
- Modify: `frontend/src/hooks/useJobRunner.ts`（`useComponentUpdateRunner` 追加）
- Create: `frontend/src/hooks/useServerRestart.ts`
- Modify: `frontend/src/components/maintenance/VersionsPanel.tsx`
- Modify: `frontend/src/screens/MaintenanceScreen.tsx` / `frontend/src/pages/MaintenancePage.tsx`
- Test: `frontend/src/hooks/__tests__/useServerRestart.test.tsx`
- Test: `frontend/src/components/maintenance/__tests__/VersionsPanel.test.tsx`（追記）

**Interfaces:**
- Consumes: `POST /api/versions/{component}/update`（Task 5・6）、既存 `useJobRunnerCore`
- Produces:
  - `api.startComponentUpdate(component: 'forge' | 'visualizer'): Promise<JobSummary>`
  - `useComponentUpdateRunner(onFinished?): UseJobRunnerResult<'forge' | 'visualizer'>`
  - `useServerRestart(): { waiting: boolean; timedOut: boolean; begin: () => void }`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/__tests__/useServerRestart.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useServerRestart } from '../useServerRestart'
import { api } from '../../api/client'

describe('useServerRestart', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.restoreAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('health が復帰したらリロードする', async () => {
    const reload = vi.fn()
    vi.spyOn(api, 'getHealth')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ status: 'ok' } as never)
    const { result } = renderHook(() => useServerRestart(reload))
    act(() => { result.current.begin() })
    expect(result.current.waiting).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => { expect(reload).toHaveBeenCalledTimes(1) })
  })

  it('上限まで復帰しなければ timedOut を立てる', async () => {
    // 無限スピナーにせず、手動再起動を案内できるようにする
    const reload = vi.fn()
    vi.spyOn(api, 'getHealth').mockRejectedValue(new Error('connection refused'))
    const { result } = renderHook(() => useServerRestart(reload))
    act(() => { result.current.begin() })
    await act(async () => { await vi.advanceTimersByTimeAsync(61000) })
    await waitFor(() => { expect(result.current.timedOut).toBe(true) })
    expect(reload).not.toHaveBeenCalled()
    expect(result.current.waiting).toBe(false)
  })
})
```

`VersionsPanel.test.tsx` に追記:

```tsx
  it('update_available かつ updatable の行にだけ更新ボタンを出す', () => {
    const onUpdate = vi.fn()
    render(
      <VersionsPanel
        components={[forgeOutdated, visLatest, strikeOk]}
        loading={false} error={null} lang="ja" onUpdate={onUpdate}
      />,
    )
    // forge のみ（visualizer は最新、strike は updatable:false）
    expect(screen.getAllByRole('button', { name: /更新/ })).toHaveLength(1)
  })

  it('strike には更新ボタンの代わりに手順への導線を出す', () => {
    render(
      <VersionsPanel
        components={[strikeOk]} loading={false} error={null} lang="ja" onUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /更新/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useServerRestart.test.tsx src/components/maintenance/__tests__/VersionsPanel.test.tsx`
Expected: FAIL — `useServerRestart` が解決できない / 更新ボタンが見つからない

- [ ] **Step 3: API クライアントと runner を追加する**

`frontend/src/api/client.ts`（`getVersions` の直後）:

```ts
  // 更新ジョブの起動。観察・キャンセルは /api/jobs 系を共用する
  startComponentUpdate: (component: 'forge' | 'visualizer'): Promise<JobSummary> =>
    request<JobSummary>(`/versions/${component}/update`, { method: 'POST' }),
```

`frontend/src/hooks/useJobRunner.ts` の末尾（`useLiveRefreshRunner` の隣）:

```ts
/**
 * ツール更新（alpha-forge / alpha-visualizer）ジョブの起動・進捗購読を担うフック。
 * ジョブ作成は POST /api/versions/{component}/update を使う点だけが異なり、
 * 残りは `useJobRunnerCore` を共有する。
 */
export function useComponentUpdateRunner(
  onFinished?: (status: JobStatus) => void,
): UseJobRunnerResult<'forge' | 'visualizer'> {
  return useJobRunnerCore(api.startComponentUpdate, onFinished)
}
```

- [ ] **Step 4: `useServerRestart` を実装する**

`frontend/src/hooks/useServerRestart.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

/** ポーリング間隔。復帰直後に画面を戻したいので短くする。 */
const POLL_INTERVAL_MS = 1000
/** 上限。これを超えたら無限スピナーにせず手動再起動を案内する。 */
export const RESTART_POLL_TIMEOUT_MS = 60_000

export interface UseServerRestartState {
  waiting: boolean
  timedOut: boolean
  begin: () => void
}

/**
 * 自己更新後のサーバー再起動を待つ hook。
 *
 * `/health` が返るまで 1 秒間隔でポーリングし、復帰したら `onRecovered`
 * （既定はページリロード）を 1 度だけ呼ぶ。上限まで復帰しなければ
 * `timedOut` を立てる。ここで諦めないと、再起動に失敗したときスピナーが
 * 永久に回り続け、ユーザーが原因にたどり着けない。
 */
export function useServerRestart(onRecovered?: () => void): UseServerRestartState {
  const [waiting, setWaiting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef(0)
  const doneRef = useRef(false)

  const stop = useCallback((): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // アンマウント時にタイマーを必ず片付ける
  useEffect(() => stop, [stop])

  const begin = useCallback((): void => {
    if (timerRef.current !== null) return
    doneRef.current = false
    setTimedOut(false)
    setWaiting(true)
    deadlineRef.current = Date.now() + RESTART_POLL_TIMEOUT_MS
    timerRef.current = setInterval(() => {
      if (Date.now() > deadlineRef.current) {
        stop()
        setWaiting(false)
        setTimedOut(true)
        return
      }
      api.getHealth()
        .then(() => {
          if (doneRef.current) return
          doneRef.current = true
          stop()
          setWaiting(false)
          if (onRecovered) {
            onRecovered()
          } else {
            window.location.reload()
          }
        })
        .catch(() => {
          // 再起動中は接続拒否が正常。次の間隔で再試行する
        })
    }, POLL_INTERVAL_MS)
  }, [onRecovered, stop])

  return { waiting, timedOut, begin }
}
```

- [ ] **Step 5: `VersionsPanel` に更新導線を足す**

`VersionsPanelProps` に追加:

```ts
  /** 更新ボタン押下。updatable かつ update_available の行にのみ表示する。 */
  onUpdate?: (component: 'forge' | 'visualizer') => void
  /** 進行中の更新対象。ボタンを disabled にして二重起動を防ぐ。 */
  updatingId?: 'forge' | 'visualizer' | null
  /** サーバー再起動待ちの表示。 */
  restarting?: boolean
  restartTimedOut?: boolean
```

import に `Button` を足し、テーブルへ操作列を追加する:

```tsx
const STRIKE_DEPLOY_DOC_URL =
  'https://github.com/alforge-labs/alpha-strike/blob/main/docs/ops/deployment.md'

// ...<thead> の <tr> 末尾に
<th style={TH_BASE}>{l('操作', 'Action')}</th>

// ...<tbody> の各 <tr> 末尾に
<td style={TD_BASE}>
  {c.id === 'strike' ? (
    // 稼働中の発注サーバーは GUI から更新しない。手順へ送るだけ
    <a href={STRIKE_DEPLOY_DOC_URL} target="_blank" rel="noreferrer">
      {l('更新手順', 'Update guide')}
    </a>
  ) : c.updatable && c.update_available && onUpdate ? (
    <Button
      onClick={() => { onUpdate(c.id as 'forge' | 'visualizer') }}
      disabled={updatingId !== null && updatingId !== undefined}
      size="sm"
    >
      {updatingId === c.id ? l('更新中…', 'Updating…') : l('更新', 'Update')}
    </Button>
  ) : null}
</td>
```

表の下に再起動待ちの表示を足す:

```tsx
{restarting ? (
  <p style={NOTE_STYLE}>{l('再起動中…', 'Restarting…')}</p>
) : null}
{restartTimedOut ? (
  <p style={NOTE_STYLE}>
    {l(
      'サーバーが復帰しませんでした。手動で `alpha-vis serve` を実行してください。',
      'The server did not come back. Please run `alpha-vis serve` manually.',
    )}
  </p>
) : null}
```

- [ ] **Step 6: `MaintenancePage` で配線する**

```tsx
  const versions = useVersions()
  const restart = useServerRestart()
  // どのコンポーネントを更新中かは runner が持たないため、ここで覚える。
  // 完了時にどちらの後処理（一覧再取得 / 再起動待ち）へ進むかの分岐に使う
  const [updatingId, setUpdatingId] = useState<'forge' | 'visualizer' | null>(null)

  const updateRunner = useComponentUpdateRunner((status) => {
    const finished = updatingId
    setUpdatingId(null)
    // 失敗・キャンセル時は何もしない。再起動は成功パスにのみ紐づける
    if (status !== 'succeeded') return
    if (finished === 'visualizer') {
      restart.begin()
    } else {
      void versions.reload()
    }
  })

  const handleUpdate = (component: 'forge' | 'visualizer'): void => {
    setUpdatingId(component)
    // start() はジョブ作成自体が失敗すると onFinished を発火せず false を返す。
    // 戻り値を見ないと updatingId が残り、全行の更新ボタンが恒久的に disabled になる
    void updateRunner.start(component).then((ok) => {
      if (!ok) setUpdatingId(null)
    })
  }
```

`MaintenanceScreenProps` に `onUpdateComponent` / `updatingComponentId` /
`restarting` / `restartTimedOut` を足し、`MaintenanceScreen` から
`VersionsPanel` へそのまま渡す。

- [ ] **Step 7: テストが通ることを確認**

Run: `cd frontend && pnpm vitest run && pnpm run lint && pnpm run build`
Expected: 全 PASS

- [ ] **Step 8: コミット**

```bash
git add frontend/src/api/client.ts frontend/src/hooks/useJobRunner.ts \
        frontend/src/hooks/useServerRestart.ts frontend/src/hooks/__tests__/useServerRestart.test.tsx \
        frontend/src/components/maintenance/ frontend/src/screens/MaintenanceScreen.tsx \
        frontend/src/pages/MaintenancePage.tsx
git commit -m "feat: メンテナンス画面から更新を実行し再起動を待てるようにする"
```

---

### Task 9: ドキュメントとスクリーンショット

**Files:**
- Modify: `README.md` / `README.en.md`
- Modify: `CLAUDE.md`（主要 API エンドポイント表）
- Modify: `../alforge-labs/mkdocs_src/{ja,en}/alpha-visualizer/` の該当ページ
- Modify: `docs/screenshots/{ja,en}/`（再撮影）

- [ ] **Step 1: `CLAUDE.md` の API 表に 3 行足す**

```markdown
| `GET /api/versions` | alpha-forge / alpha-visualizer / alpha-strike の現在版・最新版 |
| `POST /api/versions/forge/update` | alpha-forge の自己更新ジョブ起動（localhost 限定）→ 202 |
| `POST /api/versions/visualizer/update` | alpha-visualizer の自己更新ジョブ起動（localhost 限定・成功時に自動再起動）→ 202 |
```

- [ ] **Step 2: README を日英同時に更新する**

メンテナンス画面の説明に「バージョン確認と更新」を 1 段落追加する。日本語だけ・
英語だけの更新は禁止（alpha-visualizer 固有ルール）。含める内容:

- 3 ツールの現在版と最新版が並ぶこと
- alpha-forge と alpha-visualizer は GUI から更新できること
- alpha-visualizer の更新は成功時に自動再起動すること、Windows は非対応であること
- alpha-strike は表示のみで、値は最終同期時点であること

- [ ] **Step 3: スクリーンショットを再撮影する**

```bash
cd frontend
pnpm run e2e:install
pnpm run screenshots
```

- [ ] **Step 4: alforge-labs のドキュメントを更新してビルドする**

```bash
cd ../alforge-labs
uv run mkdocs build -f mkdocs.ja.yml
uv run mkdocs build -f mkdocs.en.yml
```

`mkdocs_src/{ja,en}/alpha-visualizer/` の該当ページへ同じ内容を反映し、
生成物（`ja/docs/` 等）もコミットに含める（親 CLAUDE.md 指針 10）。

- [ ] **Step 5: フルゲートを通す**

```bash
uv run pytest tests/ -q
uv run ruff check src/ tests/
uv run mypy
cd frontend && pnpm run lint && pnpm run build && pnpm vitest run
```

Expected: すべて PASS。1 つでも落ちたら Task を戻る（「テストが通った」は全部通ってから言う — Rule 9）

- [ ] **Step 6: コミットして PR を作る**

```bash
git add README.md README.en.md CLAUDE.md docs/screenshots/
git commit -m "docs: バージョン確認・更新機能のドキュメントとスクリーンショットを更新"
git push -u origin feat/tool-versions
```

PR 本文は `--body-file` で渡す（インライン `--body` はバッククォートが壊れる）。
alforge-labs 側は別 PR とし、本文で相互リンクする。

---

### Task 10（別リポジトリ: alpha-strike）: 起動時のバージョンメタ出力

> このタスクだけ作業ディレクトリが **`/Users/sakae/dev/alpha-trade/alpha-strike`** になる。
> 独立した PR とし、マージ → PyPI リリース → VM 反映まで進んで初めて
> alpha-visualizer の strike 行が `ok` になる。それまでは `unknown` ＋ 案内文が
> 出るのが正常な状態（設計 §既知の制約）。

**Files:**
- Modify: `src/alpha_strike/event_logger.py`（`write_version_meta` メソッド追加）
- Modify: `src/alpha_strike/webhook_server.py`（起動時に呼ぶ）
- Test: `tests/test_event_logger.py`（無ければ新規。既存のテスト命名に合わせる）

**Interfaces:**
- Produces:
  - `JsonlEventLogger.write_version_meta(version: str) -> None`
  - 出力: `<events_dir>/_meta.json` に
    `{"component": "alpha-strike", "version": "<version>", "started_at": "<ISO8601>"}`

`JsonlEventLogger`（`src/alpha_strike/event_logger.py`）は
`__init__(self, base_path: str | Path | None = None)` を持ち、
`_resolve_base_path()` が `LIVE_EVENTS_PATH` 環境変数 → `./data/live/events` の
順で出力先を決める。出力先を知っているのはこのクラスなので、メタ書き出しも
このクラスに置く（パス規約を二重実装しない）。

- [ ] **Step 1: 失敗するテストを書く**

```python
"""バージョンメタ（_meta.json）出力のテスト。

alpha-visualizer は `alpha-forge live sync-events` の rsync 経由でこのファイルを
読み、メンテナンス画面へ alpha-strike のバージョンを表示する。
"""
from __future__ import annotations

import json
import pathlib

from alpha_strike.event_logger import JsonlEventLogger


def test_write_version_metaがバージョンを書き出す(tmp_path: pathlib.Path) -> None:
    JsonlEventLogger(tmp_path).write_version_meta("1.0.4")
    payload = json.loads((tmp_path / "_meta.json").read_text(encoding="utf-8"))
    assert payload["component"] == "alpha-strike"
    assert payload["version"] == "1.0.4"
    assert payload["started_at"]


def test_meta_jsonはload_eventsに混ざらない(tmp_path: pathlib.Path) -> None:
    """_meta.json がイベント走査に混入すると取り込みが壊れる（設計 §3 の前提）。

    load_events は `glob("*.jsonl")` なので `.json` は対象外だが、将来この
    glob が `*.json*` などへ緩められると alpha-strike と alpha-forge の
    両方のイベント取り込みが同時に壊れる。ここで固定する。
    """
    logger = JsonlEventLogger(tmp_path)
    logger.write_version_meta("1.0.4")
    (tmp_path / "2026-08-10.moomoo.jsonl").write_text(
        '{"event_type": "signal", "event_id": "e1"}\n', encoding="utf-8"
    )
    events = logger.load_events()
    assert len(events) == 1
    assert events[0]["event_id"] == "e1"


def test_書き込み失敗は例外を投げない(tmp_path: pathlib.Path) -> None:
    """バージョン表示は補助情報。発注サーバーの起動を止めてはいけない。"""
    blocked = tmp_path / "file-not-dir"
    blocked.write_text("", encoding="utf-8")
    # ファイルを親ディレクトリとして扱わせ、mkdir を失敗させる
    target = blocked / "events"
    JsonlEventLogger(target).write_version_meta("1.0.4")
    # 例外を投げないだけでなく、中途半端なファイルも残さない
    assert not (target / "_meta.json").exists()
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /Users/sakae/dev/alpha-trade/alpha-strike && uv run pytest tests/test_event_logger.py -v`
Expected: FAIL — `AttributeError: 'JsonlEventLogger' object has no attribute 'write_version_meta'`

- [ ] **Step 3: `JsonlEventLogger` にメソッドを足す**

`src/alpha_strike/event_logger.py` の `append` の隣に追加:

```python
    def write_version_meta(self, version: str) -> None:
        """バージョン情報を events ディレクトリへ書き出す。

        alpha-visualizer が `alpha-forge live sync-events` の rsync 経由でこれを
        読み、メンテナンス画面へ alpha-strike のバージョンを表示する。

        ファイル名を `.jsonl` にしてはいけない。自分の `load_events`
        （`glob("*.jsonl")`）と alpha-forge の `live/store.py` の
        `glob("*.jsonl")` の両方に混入し、イベント取り込みが壊れる。

        書き込み失敗は握って警告ログのみ残す（`append` と同じ方針）。
        バージョン表示は補助情報であり、発注サーバーの起動を止める理由にならない。
        """
        payload = {
            "component": "alpha-strike",
            "version": version,
            "started_at": datetime.now().astimezone().isoformat(),
        }
        try:
            base_path = self._resolve_base_path()
            base_path.mkdir(parents=True, exist_ok=True)
            (base_path / "_meta.json").write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
        except OSError as exc:
            logger.warning("バージョンメタの書き出しに失敗しました: %s", exc)
```

- [ ] **Step 4: 起動時に呼ぶ**

`webhook_server.py` は `event_logger = JsonlEventLogger()` をモジュールレベルで
持ち（`:93`）、`lifespan`（`:148`）を FastAPI に渡している（`:242`）。
`lifespan` の `yield` より前（startup 側）に 1 行足す:

```python
    # 同期済み _meta.json から alpha-visualizer がバージョンを読む
    event_logger.write_version_meta(__version__)
```

import に `from alpha_strike import __version__` を追加する
（`src/alpha_strike/__init__.py:6` が `importlib.metadata` から解決している）。

- [ ] **Step 5: テストが通ることを確認**

Run: `cd /Users/sakae/dev/alpha-trade/alpha-strike && uv run pytest tests/ -q && uv run ruff check src/ tests/`
Expected: 全 PASS

- [ ] **Step 6: コミットして PR を作る**

```bash
cd /Users/sakae/dev/alpha-trade/alpha-strike
git checkout -b feat/version-meta
git add src/alpha_strike/event_logger.py src/alpha_strike/webhook_server.py tests/
git commit -m "feat: 起動時に events ディレクトリへバージョンメタを書き出す"
git push -u origin feat/version-meta
```

---

## 実装順の補足

Task 1〜9 は alpha-visualizer の 1 本の PR にまとめる。Task 10 は alpha-strike の
別 PR で、どちらが先にマージされても互いを壊さない（visualizer 側は `_meta.json`
が無い状態を `unknown` として正常に扱うため）。
