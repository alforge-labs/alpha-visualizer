# `/maintenance` 孤児実行結果の掃除画面 実装計画（SP3 フェーズ 2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 孤児バックテスト結果（実データで 128 ID / 83.4 MB）を一覧で見て、選んで削除できる `/maintenance` 画面を追加する。

**Architecture:** 一覧も削除も `alpha-forge backtest prune-orphans`（フェーズ 1 でマージ済み）に委譲し、visualizer は孤児を自前で算出しない。バックエンドは `routers/run.py` と同じ同期 subprocess パターン。フロントは新ルート `/maintenance` に Container/Presentational で 1 画面。

**Tech Stack:** FastAPI / pydantic / pytest（バックエンド）、React 19 + TypeScript / Vite / Vitest / Playwright（フロント）、uv / pnpm

**設計仕様（SSoT）:** `docs/superpowers/specs/2026-07-27-maintenance-orphan-runs-design.md` の §4

## Global Constraints

- Python は **`uv`**、フロントは **pnpm**。フロントのコマンドは `frontend/` で実行する。
- **`src/alpha_visualizer/` から `alpha_forge` を import しない。** これが CLI 委譲を選んだ理由そのもの。
- **孤児を visualizer で算出しない。** 組み込みテンプレート戦略 7 件を visualizer は知らないため、自前算出は実行可能な戦略を孤児として表示する（フェーズ 1 で実データ発火した欠陥の再現）。ハードコードもしない。
- **`DELETE` で `strategy_ids` が空のとき forge を呼ばない。** CLI は `--strategy` 省略時に**全孤児を削除する**。空配列をそのまま渡すと選択 0 件の削除が全 128 件の削除になる。
- **`DELETE` の subprocess 起動前に `engine.dispose()` を呼ぶ。** `VACUUM` は DB 全体の排他ロックを取る。この画面は直読みしないが、Browse / Detail など他画面が同じ Engine を使っており接続が残っている。
- `src/alpha_visualizer/schemas/*.py` を変更したら **`cd frontend && pnpm run gen`** を実行して生成ファイルもコミットする（CI の `openapi-types` ジョブが drift を検出する）。
- **`tsc --noEmit` は `tsconfig` の `files: []` により 0 ファイルを検査して常に成功する。** 型検査の実ゲートは `pnpm run build`（`tsc -b && vite build`）。
- `pnpm run lint` は**パイプに繋がず単独行で実行**して終了コードを確認する。
- `noUncheckedIndexedAccess: true`。`arr[0]` は `T | undefined`。`!` や `as` でもみ消さない。
- オブジェクトリテラルの同一キー二重指定は TS2783 でビルドが落ちる。
- `any` 禁止。exported な関数・インターフェースには型を明示する。
- `screens/` は `useState` / `useEffect` / fetch hook を呼べない（ADR-0001）。pure function の呼び出しは可。
- 表示文字列は日英両方を `makeL(lang)('日本語', 'English')` で用意する。
- インライン `style` + CSS 変数がこのコードベースの流儀。CSS ファイルを新設しない。
- コメント・コミットメッセージは**日本語**。Conventional Commits 形式。
- `git push` はタスク内で行わない。

---

## ファイル構成

**新規作成**

| ファイル | 責務 |
|---|---|
| `src/alpha_visualizer/schemas/maintenance.py` | `OrphanRunItem` / `OrphanRunsResponse` / `PruneOrphansRequest` / `PruneOrphansResponse` |
| `src/alpha_visualizer/routers/maintenance.py` | `GET` / `DELETE /api/maintenance/orphan-runs`。forge CLI へ委譲 |
| `tests/routers/test_maintenance.py` | 上記のテスト（subprocess はモック） |
| `frontend/src/pages/MaintenancePage.tsx` | Container。データ取得・選択状態・削除実行 |
| `frontend/src/screens/MaintenanceScreen.tsx` | Presentational。props だけで描画 |
| `frontend/src/hooks/useOrphanRuns.ts` | 一覧取得・削除の hook |
| `frontend/src/components/ConfirmDialog.tsx` | 不可逆操作の確認ダイアログ。開閉 state を自前で持つ |
| `frontend/src/screens/__tests__/MaintenanceScreen.test.tsx` | 画面のテスト |
| `frontend/src/hooks/__tests__/useOrphanRuns.test.tsx` | hook のテスト |

> **`api/types` からの型の出し方:** 画面とテストは
> `import type { OrphanRunItem } from '../../api/types'` の形で使う。
> `frontend/src/api/types.ts` が `types.gen.ts` から型を再エクスポートしている構造なので、
> 既存の `StrategyListItem` がどう出ているかを読んで、同じ形で `OrphanRunItem` /
> `OrphanRunsResponse` / `PruneOrphansResponse` を出すこと。

**変更**

| ファイル | 内容 |
|---|---|
| `src/alpha_visualizer/app.py` | `maintenance_router` を登録 |
| `frontend/src/api/client.ts` | `listOrphanRuns` / `pruneOrphanRuns` を追加 |
| `frontend/src/router.tsx` | `/maintenance` を追加 |
| `frontend/src/components/AppNav.tsx` | ナビに 1 項目追加 |
| `frontend/src/api/types.gen.ts` / `frontend/openapi.json` | `pnpm run gen` で再生成 |
| `frontend/e2e/specs/` | 新規 E2E |
| `docs/screenshots/{ja,en}/*.png` | AppNav が全画面に出るため**全スクリーンショット**を再撮影 |

---

## Task 1: バックエンド API

**Files:**
- Create: `src/alpha_visualizer/schemas/maintenance.py`
- Create: `src/alpha_visualizer/routers/maintenance.py`
- Create: `tests/routers/test_maintenance.py`
- Modify: `src/alpha_visualizer/app.py`
- Modify: `frontend/openapi.json` / `frontend/src/api/types.gen.ts`（`pnpm run gen` で再生成）

**Interfaces:**
- Consumes（すべて既存）:
  - `alpha_visualizer.services.forge_cli`: `FORGE_NOT_FOUND_MESSAGE: str` / `resolve_forge_exe() -> str | None` / `build_forge_env(cfg: ForgeConfig) -> dict[str, str]` / `mask_home(text: str) -> str` / `parse_json_lenient(stdout: str) -> dict[str, Any] | None`
  - `alpha_visualizer.errors.ExternalProcessError`
  - `alpha_visualizer.dependencies.get_forge_config_dep(request) -> ForgeConfig`
  - `alpha_visualizer.forge_config.ForgeConfig`（`forge_dir` 属性を持つ）
  - 実装の手本: `src/alpha_visualizer/routers/run.py`（`POST /api/run` が forge を同期実行する）
- Produces（Task 2 が使う）:
  - `GET /api/maintenance/orphan-runs` → `OrphanRunsResponse`
  - `DELETE /api/maintenance/orphan-runs` （body: `{"strategy_ids": [...]}`）→ `PruneOrphansResponse`

- [ ] **Step 1: 失敗するテストを書く**

`tests/routers/test_maintenance.py` を新規作成する。

```python
"""maintenance ルーターのテスト（forge CLI 委譲）。"""

from __future__ import annotations

import json
from unittest import mock

from fastapi.testclient import TestClient

# フェーズ1 の CLI が返す JSON（実データの形をそのまま縮めたもの）
CLI_LIST_JSON = json.dumps({
    "orphans": [
        {
            "strategy_id": "lev_tmp",
            "backtest_run_count": 20,
            "optimization_run_count": 0,
            "bytes": 5856500,
            "first_run_at": "2026-06-08T14:05:30.187973+00:00",
            "last_run_at": "2026-06-08T14:07:20.920498+00:00",
        },
        {
            "strategy_id": "a158_sma_base",
            "backtest_run_count": 1,
            "optimization_run_count": 2,
            "bytes": 1024,
            "first_run_at": "2026-05-11T00:00:00+00:00",
            "last_run_at": "2026-05-12T00:00:00+00:00",
        },
    ],
    "count": 2,
    "total_bytes": 5857524,
    "dry_run": True,
    "deleted": None,
})

CLI_DELETE_JSON = json.dumps({
    "orphans": [],
    "count": 0,
    "total_bytes": 0,
    "dry_run": False,
    "deleted": {
        "strategy_ids": ["lev_tmp"],
        "backtest_rows": 20,
        "optimization_rows": 0,
        "bytes_before": 227000000,
        "bytes_after": 221000000,
        "vacuum_error": None,
    },
})


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


class TestOrphanRunsList:
    def test_CLI_の_json_をそのまま返す(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_LIST_JSON)) as run_mock,
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 2
        assert body["total_bytes"] == 5857524
        assert [o["strategy_id"] for o in body["orphans"]] == ["lev_tmp", "a158_sma_base"]
        assert body["orphans"][0]["optimization_run_count"] == 0
        assert body["orphans"][1]["optimization_run_count"] == 2

        # 一覧は必ず読み取り専用で呼ぶ。--dry-run が無いと実削除になる
        argv = run_mock.call_args[0][0]
        assert "prune-orphans" in argv
        assert "--dry-run" in argv
        assert "--json" in argv
        assert "-y" not in argv
        assert "--vacuum" not in argv

    def test_孤児0件なら空配列を返す(self, client_with_db: TestClient) -> None:
        empty = json.dumps({
            "orphans": [], "count": 0, "total_bytes": 0, "dry_run": True, "deleted": None,
        })
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=empty)),
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code == 200
        assert resp.json()["orphans"] == []
        assert resp.json()["count"] == 0

    def test_forge未導入なら導線付きのエラーを返す(self, client_with_db: TestClient) -> None:
        with mock.patch("shutil.which", return_value=None):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code >= 400
        assert "alforgelabs.com" in json.dumps(resp.json(), ensure_ascii=False)

    def test_forgeが非ゼロ終了したらエラーにする(self, client_with_db: TestClient) -> None:
        # 成功に見せてはいけない。空一覧を返すと「掃除済み」と誤読される
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(returncode=1, stderr="boom")),
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code >= 400

    def test_stdoutが壊れていたらエラーにする(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout="not json at all")),
        ):
            resp = client_with_db.get("/api/maintenance/orphan-runs")

        assert resp.status_code >= 400


class TestOrphanRunsDelete:
    def test_選択したIDだけをstrategyオプションで渡す(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_DELETE_JSON)) as run_mock,
        ):
            resp = client_with_db.request(
                "DELETE",
                "/api/maintenance/orphan-runs",
                json={"strategy_ids": ["lev_tmp", "a158_sma_base"]},
            )

        assert resp.status_code == 200
        argv = run_mock.call_args[0][0]
        assert "-y" in argv
        assert "--vacuum" in argv
        assert "--json" in argv
        assert "--dry-run" not in argv
        # 選択した 2 件が --strategy で渡ること
        pairs = [(argv[i], argv[i + 1]) for i in range(len(argv) - 1) if argv[i] == "--strategy"]
        assert pairs == [("--strategy", "lev_tmp"), ("--strategy", "a158_sma_base")]

    def test_空の選択ではforgeを呼ばない(self, client_with_db: TestClient) -> None:
        """CLI は --strategy 省略時に全孤児を削除する。

        空配列をそのまま組み立てると、選択 0 件の削除が全件削除になる。
        この機能で最も危険な経路なのでガードを固定する。
        """
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_DELETE_JSON)) as run_mock,
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": []},
            )

        assert resp.status_code == 400
        run_mock.assert_not_called()

    def test_削除結果を返す(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=CLI_DELETE_JSON)),
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        body = resp.json()
        assert body["deleted_strategy_ids"] == ["lev_tmp"]
        assert body["deleted_backtest_rows"] == 20
        assert body["deleted_optimization_rows"] == 0
        assert body["reclaimed_bytes"] == 227000000 - 221000000
        assert body["vacuum_error"] is None

    def test_vacuum失敗を区別して返す(self, client_with_db: TestClient) -> None:
        """削除は完了しているので成功扱いにしつつ、容量回収の失敗は伝える。"""
        payload = json.loads(CLI_DELETE_JSON)
        payload["deleted"]["vacuum_error"] = "database is locked"
        payload["deleted"]["bytes_after"] = payload["deleted"]["bytes_before"]
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=json.dumps(payload))),
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["vacuum_error"] == "database is locked"
        assert body["reclaimed_bytes"] == 0
        assert body["deleted_backtest_rows"] == 20

    def test_subprocess起動前にengineをdisposeする(self, client_with_db: TestClient) -> None:
        """VACUUM は DB 全体の排他ロックを取る。

        この画面は直読みしないが、他画面が同じ Engine を使っており接続が残る。
        dispose を忘れると forge が database is locked で exit 1 になる。
        """
        calls: list[str] = []
        engine = client_with_db.app.state.engine

        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch.object(
                engine, "dispose", side_effect=lambda *a, **k: calls.append("dispose")
            ),
            mock.patch(
                "subprocess.run",
                side_effect=lambda *a, **k: (calls.append("subprocess"), _proc(stdout=CLI_DELETE_JSON))[1],
            ),
        ):
            client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        assert calls == ["dispose", "subprocess"]

    def test_forgeが非ゼロ終了したら削除もエラーにする(self, client_with_db: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/forge"),
            mock.patch("subprocess.run", return_value=_proc(returncode=1, stderr="guard tripped")),
        ):
            resp = client_with_db.request(
                "DELETE", "/api/maintenance/orphan-runs", json={"strategy_ids": ["lev_tmp"]},
            )

        assert resp.status_code >= 400
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `uv run pytest tests/routers/test_maintenance.py -q`
Expected: FAIL（`/api/maintenance/orphan-runs` が 404）

> `client_with_db` fixture は `tests/conftest.py` に既存。`app.state.engine` を持つ TestClient を返す。存在を確認してから使うこと。無ければ既存のルーターテスト（`tests/routers/test_run.py`）が使っている fixture 名に合わせる。

- [ ] **Step 3: スキーマを実装する**

`src/alpha_visualizer/schemas/maintenance.py` を新規作成する。

```python
"""`/api/maintenance` のリクエスト・レスポンススキーマ。

孤児の一覧・削除はいずれも forge CLI（`backtest prune-orphans`）に委譲する。
visualizer 側で孤児を算出しない理由は設計仕様 §4.2 を参照。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OrphanRunItem(BaseModel):
    """孤児 1 件。forge CLI の `--json` の `orphans[]` と 1:1 で対応する。"""

    strategy_id: str
    backtest_run_count: int
    optimization_run_count: int
    #: JSON 列のバイト長合計（概算）。SQLite の実占有量ではない
    bytes: int
    first_run_at: str | None = None
    last_run_at: str | None = None


class OrphanRunsResponse(BaseModel):
    orphans: list[OrphanRunItem]
    count: int
    total_bytes: int


class PruneOrphansRequest(BaseModel):
    #: 削除する strategy_id。空は受け付けない（CLI は --strategy 省略で全削除になる）
    strategy_ids: list[str] = Field(min_length=1)


class PruneOrphansResponse(BaseModel):
    deleted_strategy_ids: list[str]
    deleted_backtest_rows: int
    deleted_optimization_rows: int
    #: VACUUM で回収したバイト数。VACUUM 失敗時は 0
    reclaimed_bytes: int
    #: VACUUM が失敗したときのメッセージ。成功なら None
    vacuum_error: str | None = None
```

- [ ] **Step 4: ルーターを実装する**

`src/alpha_visualizer/routers/maintenance.py` を新規作成する。`routers/run.py` の
subprocess 実行部分を読んでから、同じ形（`subprocess.run` に `capture_output=True` /
`text=True` / `timeout` / `env` / `cwd` / `stdin=DEVNULL` を渡す）で書くこと。

```python
"""メンテナンス API ルーター

`GET/DELETE /api/maintenance/orphan-runs` を提供する。

孤児（戦略定義がもう存在しない strategy_id の実行結果）の一覧と削除を、
`alpha-forge backtest prune-orphans` に委譲する。**visualizer 側で孤児を算出しない。**
visualizer は規約上 alpha_forge を import できず、組み込みテンプレート戦略の存在を
知らないため、自前で算出すると実行可能な戦略を孤児として表示してしまう
（設計仕様 §4.2）。
"""
from __future__ import annotations

import logging
import subprocess
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.requests import Request

from alpha_visualizer.dependencies import get_forge_config_dep
from alpha_visualizer.errors import ExternalProcessError
from alpha_visualizer.forge_config import ForgeConfig
from alpha_visualizer.schemas.maintenance import (
    OrphanRunsResponse,
    PruneOrphansRequest,
    PruneOrphansResponse,
)
from alpha_visualizer.services.forge_cli import (
    FORGE_NOT_FOUND_MESSAGE,
    build_forge_env,
    mask_home,
    parse_json_lenient,
    resolve_forge_exe,
)

logger = logging.getLogger(__name__)

router = APIRouter()

#: 一覧は forge の起動コストが支配的（実測 3 秒前後）。VACUUM を伴う削除は
#: DB サイズ次第で伸びるため長めに取る。
LIST_TIMEOUT_SEC = 60
PRUNE_TIMEOUT_SEC = 900


def _run_forge(argv: list[str], forge_cfg: ForgeConfig, timeout: int) -> dict[str, Any]:
    """forge を同期実行し、stdout の JSON を返す。"""
    exe = resolve_forge_exe()
    if exe is None:
        raise ExternalProcessError(FORGE_NOT_FOUND_MESSAGE)

    try:
        proc = subprocess.run(
            [exe, *argv],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=build_forge_env(forge_cfg),
            cwd=str(forge_cfg.forge_dir),
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as e:
        raise ExternalProcessError(f"forge がタイムアウトしました（{timeout} 秒）") from e

    if proc.returncode != 0:
        # 空一覧を返して「掃除済み」と誤読させてはいけない
        detail = mask_home((proc.stderr or proc.stdout or "").strip())
        raise ExternalProcessError(f"forge が異常終了しました（exit {proc.returncode}）: {detail}")

    payload = parse_json_lenient(proc.stdout)
    if payload is None:
        raise ExternalProcessError("forge の出力を JSON として解釈できませんでした")
    return payload


@router.get("/api/maintenance/orphan-runs", response_model=OrphanRunsResponse)
def list_orphan_runs(
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> OrphanRunsResponse:
    # --dry-run を必ず付ける。付け忘れると一覧を見ただけで削除が走る
    payload = _run_forge(
        ["backtest", "prune-orphans", "--dry-run", "--json"],
        forge_cfg,
        LIST_TIMEOUT_SEC,
    )
    return OrphanRunsResponse(
        orphans=payload.get("orphans", []),
        count=payload.get("count", 0),
        total_bytes=payload.get("total_bytes", 0),
    )


@router.delete("/api/maintenance/orphan-runs", response_model=PruneOrphansResponse)
def prune_orphan_runs(
    request: Request,
    body: PruneOrphansRequest,
    forge_cfg: Annotated[ForgeConfig, Depends(get_forge_config_dep)],
) -> PruneOrphansResponse:
    # forge は --strategy 省略時に「全孤児」を対象にする。空配列をそのまま
    # 組み立てると、選択 0 件の削除が全件削除になる。ここで必ず止める。
    if not body.strategy_ids:
        raise HTTPException(status_code=400, detail="削除する strategy_id が指定されていません")

    # VACUUM は DB 全体の排他ロックを取る。この画面は直読みしないが、
    # Browse / Detail など他画面が同じ Engine を使っており接続が残っている。
    engine = getattr(request.app.state, "engine", None)
    if engine is not None:
        engine.dispose()

    argv = ["backtest", "prune-orphans", "-y", "--vacuum", "--json"]
    for strategy_id in body.strategy_ids:
        argv += ["--strategy", strategy_id]

    payload = _run_forge(argv, forge_cfg, PRUNE_TIMEOUT_SEC)
    deleted = payload.get("deleted") or {}
    before = int(deleted.get("bytes_before", 0))
    after = int(deleted.get("bytes_after", 0))
    return PruneOrphansResponse(
        deleted_strategy_ids=list(deleted.get("strategy_ids", [])),
        deleted_backtest_rows=int(deleted.get("backtest_rows", 0)),
        deleted_optimization_rows=int(deleted.get("optimization_rows", 0)),
        reclaimed_bytes=max(0, before - after),
        vacuum_error=deleted.get("vacuum_error"),
    )
```

- [ ] **Step 5: ルーターを登録する**

`src/alpha_visualizer/app.py` の import 群（`from alpha_visualizer.routers import live as live_router` の隣、アルファベット順の位置）に追加する。

```python
from alpha_visualizer.routers import maintenance as maintenance_router
```

同ファイルの `include_router` を並べている箇所に、既存と同じ形で追加する。

```python
    app.include_router(maintenance_router.router)
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `uv run pytest tests/routers/test_maintenance.py -q`
Expected: PASS（12 ケース）

- [ ] **Step 7: 判別力を確認する（ablation・3 回）**

各退行を入れてテストを走らせ、**期待どおりのテストが落ちること**を確認してから元に戻す。落ちなかった場合はテストを強化してから先へ進む。

1. `prune_orphan_runs` の `if not body.strategy_ids:` ガードを削除する
   → 「空の選択では forge を呼ばない」が落ちること。**これが最も重要な ablation**
2. `engine.dispose()` の呼び出しを削除する
   → 「subprocess 起動前に engine を dispose する」が落ちること
3. `_run_forge` の `if proc.returncode != 0:` ブロックを削除する
   → 「forge が非ゼロ終了したらエラーにする」（一覧・削除の両方）が落ちること

- [ ] **Step 8: OpenAPI 型を再生成する**

スキーマを追加したので必須。

Run: `cd frontend && pnpm run gen`
Expected: `frontend/openapi.json` と `frontend/src/api/types.gen.ts` が更新される

- [ ] **Step 9: バックエンドのゲートを通す**

1 行ずつ別々に実行する。

Run: `uv run pytest tests/ -q`
Expected: 全件 PASS

Run: `uv run ruff check src/ tests/`
Expected: exit 0

- [ ] **Step 10: コミット**

```bash
git add src/alpha_visualizer/schemas/maintenance.py src/alpha_visualizer/routers/maintenance.py src/alpha_visualizer/app.py tests/routers/test_maintenance.py frontend/openapi.json frontend/src/api/types.gen.ts
git commit -m "feat(maintenance): 孤児実行結果の一覧・削除 API を追加（forge CLI へ委譲）"
```

---

## Task 2: `/maintenance` 画面

**Files:**
- Create: `frontend/src/hooks/useOrphanRuns.ts`
- Create: `frontend/src/screens/MaintenanceScreen.tsx`
- Create: `frontend/src/pages/MaintenancePage.tsx`
- Create: `frontend/src/hooks/__tests__/useOrphanRuns.test.tsx`
- Create: `frontend/src/screens/__tests__/MaintenanceScreen.test.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/AppNav.tsx`

**Interfaces:**
- Consumes（Task 1 が作成）:
  - `GET /api/maintenance/orphan-runs` → `{ orphans: OrphanRunItem[], count: number, total_bytes: number }`
  - `OrphanRunItem` = `{ strategy_id: string; backtest_run_count: number; optimization_run_count: number; bytes: number; first_run_at: string | null; last_run_at: string | null }`
  - `DELETE /api/maintenance/orphan-runs`（body `{ strategy_ids: string[] }`）→ `{ deleted_strategy_ids: string[]; deleted_backtest_rows: number; deleted_optimization_rows: number; reclaimed_bytes: number; vacuum_error: string | null }`
  - 型は `pnpm run gen` で `src/api/types.gen.ts` に生成済み
- Consumes（既存）:
  - `fmtNumber(value, { decimals?, suffix? })` / `fmtDate(value)`（`src/lib/format.ts`。null は `'—'`）
  - `makeL(lang)(ja, en)`（`src/i18n/strings.ts`）
  - `Loading`（`src/design/primitives`）
  - `api`（`src/api/client.ts`）の既存メソッドの書き方に合わせる
- Produces: `/maintenance` ルート

- [ ] **Step 1: 失敗するテストを書く（画面）**

`frontend/src/screens/__tests__/MaintenanceScreen.test.tsx` を新規作成する。

`MaintenanceScreen` は Presentational で、次の props を取る。

```ts
interface MaintenanceScreenProps {
  orphans: OrphanRunItem[]
  totalBytes: number
  loading: boolean
  error: string | null
  selectedIds: string[]
  onToggleId: (strategyId: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDelete: () => void
  deleting: boolean
  result: PruneResultView | null
  lang: Lang
}

interface PruneResultView {
  deletedCount: number
  deletedBacktestRows: number
  deletedOptimizationRows: number
  reclaimedBytes: number
  vacuumError: string | null
}
```

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MaintenanceScreen } from '../MaintenanceScreen'
import type { OrphanRunItem } from '../../api/types'

const ORPHANS: OrphanRunItem[] = [
  {
    strategy_id: 'lev_tmp',
    backtest_run_count: 20,
    optimization_run_count: 0,
    bytes: 5856500,
    first_run_at: '2026-06-08T14:05:30+00:00',
    last_run_at: '2026-06-08T14:07:20+00:00',
  },
  {
    strategy_id: 'a158_sma_base',
    backtest_run_count: 1,
    optimization_run_count: 2,
    bytes: 1024,
    first_run_at: '2026-05-11T00:00:00+00:00',
    last_run_at: '2026-05-12T00:00:00+00:00',
  },
]

function baseProps() {
  return {
    orphans: ORPHANS,
    totalBytes: 5857524,
    loading: false,
    error: null,
    selectedIds: [] as string[],
    onToggleId: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onDelete: vi.fn(),
    deleting: false,
    result: null,
    lang: 'ja' as const,
  }
}

describe('<MaintenanceScreen />', () => {
  it('既定では 1 件も選択されていない', () => {
    render(<MaintenanceScreen {...baseProps()} />)
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).not.toBeChecked()
    }
  })

  it('選択 0 件では削除ボタンが無効', () => {
    render(<MaintenanceScreen {...baseProps()} />)
    expect(screen.getByRole('button', { name: /削除/ })).toBeDisabled()
  })

  it('選択件数と合計容量がボタンに出る', () => {
    render(<MaintenanceScreen {...baseProps()} selectedIds={['lev_tmp']} />)
    const button = screen.getByRole('button', { name: /削除/ })
    expect(button).toBeEnabled()
    expect(button.textContent).toContain('1')
    // 5856500 B = 5.6 MB
    expect(button.textContent).toContain('5.6')
  })

  it('チェックボックスのクリックで onToggleId が呼ばれる', async () => {
    const props = baseProps()
    render(<MaintenanceScreen {...props} />)
    const row = screen.getByText('lev_tmp').closest('tr')
    if (!row) throw new Error('lev_tmp の行が無い')
    await userEvent.click(within(row).getByRole('checkbox'))
    expect(props.onToggleId).toHaveBeenCalledWith('lev_tmp')
  })

  it('孤児 0 件のとき空状態を出し、表を描かない', () => {
    render(<MaintenanceScreen {...baseProps()} orphans={[]} totalBytes={0} />)
    expect(screen.getByText(/孤児の実行結果はありません/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('エラーを表示する', () => {
    render(<MaintenanceScreen {...baseProps()} error="forge コマンドが見つかりません" />)
    expect(screen.getByText(/forge コマンドが見つかりません/)).toBeInTheDocument()
  })

  it('削除中はボタンを無効にする', () => {
    render(<MaintenanceScreen {...baseProps()} selectedIds={['lev_tmp']} deleting />)
    expect(screen.getByRole('button', { name: /削除/ })).toBeDisabled()
  })

  it('削除結果に回収容量を出す', () => {
    render(
      <MaintenanceScreen
        {...baseProps()}
        orphans={[]}
        result={{
          deletedCount: 2,
          deletedBacktestRows: 21,
          deletedOptimizationRows: 2,
          reclaimedBytes: 6000000,
          vacuumError: null,
        }}
      />,
    )
    expect(screen.getByText(/5\.7 MB/)).toBeInTheDocument()
  })

  it('VACUUM 失敗時は削除の成功と分けて伝える', () => {
    render(
      <MaintenanceScreen
        {...baseProps()}
        orphans={[]}
        result={{
          deletedCount: 1,
          deletedBacktestRows: 20,
          deletedOptimizationRows: 0,
          reclaimedBytes: 0,
          vacuumError: 'database is locked',
        }}
      />,
    )
    // 削除できたことは伝える
    expect(screen.getByText(/20/)).toBeInTheDocument()
    // 容量回収が失敗したことも伝える
    expect(screen.getByText(/--vacuum/)).toBeInTheDocument()
  })

  it('全選択ボタンで onSelectAll が呼ばれる', async () => {
    const props = baseProps()
    render(<MaintenanceScreen {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /すべて選択/ }))
    expect(props.onSelectAll).toHaveBeenCalled()
  })

  it('削除ボタンを押すと確認を挟み、承認するまで onDelete を呼ばない', async () => {
    // 不可逆な操作なので、1 クリックで実行されてはならない
    const props = baseProps()
    render(<MaintenanceScreen {...props} selectedIds={['lev_tmp']} />)

    await userEvent.click(screen.getByRole('button', { name: /削除/ }))
    expect(props.onDelete).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    // 確認には件数・容量・元に戻せないことが出る
    expect(dialog.textContent).toContain('1')
    expect(dialog.textContent).toContain('5.6')
    expect(dialog.textContent).toMatch(/元に戻せません/)

    await userEvent.click(within(dialog).getByRole('button', { name: /削除する/ }))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('確認をキャンセルすると onDelete を呼ばない', async () => {
    const props = baseProps()
    render(<MaintenanceScreen {...props} selectedIds={['lev_tmp']} />)

    await userEvent.click(screen.getByRole('button', { name: /削除/ }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /キャンセル/ }),
    )

    expect(props.onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

> **確認ダイアログの state はどこに置くか:** `screens/` は `useState` を持てない
> （ADR-0001）。ダイアログの開閉は `MaintenanceScreen` の中に置けないので、
> **`components/` 配下に `ConfirmDialog` を切り出して自前の `useState` を持たせる**
> （`components/browser/CollapsibleSection.tsx` が同じ理由で自前 state を持っている前例が
> ある）。`MaintenanceScreen` はそれを描くだけにする。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/screens/__tests__/MaintenanceScreen.test.tsx`
Expected: FAIL（`../MaintenanceScreen` が存在しない）

- [ ] **Step 3: 画面を実装する**

`frontend/src/screens/MaintenanceScreen.tsx` を新規作成する。既存の
`src/components/browser/SymbolCoverageTable.tsx` を読んで、表のスタイル
（`TD_BASE` 相当のインライン style + CSS 変数、`u-scroll-x` での横スクロール）を
合わせること。列は 選択 / `strategy_id` / バックテスト / 最適化 / 容量 / 最終実行。

要件（テストが固定しているもの）:

- `orphans` が空なら表を描かず「孤児の実行結果はありません / No orphan runs」を出す
- `error` があればそれを表示する
- チェックボックスは `selectedIds` に従い、変更で `onToggleId(strategy_id)` を呼ぶ
- 削除ボタンのラベルは選択件数と合計容量を含む
  （例: `選択した 1 件（5.6 MB）を削除` / `Delete 1 selected (5.6 MB)`）
- `selectedIds.length === 0` または `deleting` のときボタンは `disabled`
- 「すべて選択 / Select all」と「選択を解除 / Clear」のボタンを置く
- `result` があれば削除件数・行数・回収容量を出す。`vacuumError` があるときは
  「削除は完了したが容量の回収に失敗した。空き容量を確保して
  `alpha-forge backtest prune-orphans --vacuum` を実行してほしい」旨を併せて出す
- 容量は MB 表示（`fmtNumber(bytes / 1024 / 1024, { decimals: 1, suffix: ' MB' })`）
- 画面の冒頭に、この操作が不可逆であることと「孤児は必ずしも不要なデータではない
  （`strategy delete` は `--with-results` 無しで結果を意図的に残す）」旨の注意書きを置く

削除ボタンと確認の要点は次のとおり。**この部分はテストが厳密に固定しているので verbatim で
使うこと**（スタイルは `SymbolCoverageTable` に合わせて足す）。

```tsx
const selectedBytes = orphans
  .filter(o => selectedIds.includes(o.strategy_id))
  .reduce((acc, o) => acc + o.bytes, 0)
const selectedMb = fmtNumber(selectedBytes / 1024 / 1024, { decimals: 1 })

// 不可逆なので 1 クリックでは実行させない。ConfirmDialog が開閉 state を持つ
<ConfirmDialog
  triggerLabel={L(
    `選択した ${selectedIds.length} 件（${selectedMb} MB）を削除`,
    `Delete ${selectedIds.length} selected (${selectedMb} MB)`,
  )}
  triggerDisabled={selectedIds.length === 0 || deleting}
  title={L('孤児の実行結果を削除します', 'Delete orphan runs')}
  body={L(
    `${selectedIds.length} 件（${selectedMb} MB）を削除します。元に戻せません。`,
    `Deleting ${selectedIds.length} entries (${selectedMb} MB). This cannot be undone.`,
  )}
  confirmLabel={L('削除する', 'Delete')}
  cancelLabel={L('キャンセル', 'Cancel')}
  onConfirm={onDelete}
  lang={lang}
/>
```

`ConfirmDialog` は `frontend/src/components/ConfirmDialog.tsx` に新規作成する。
`role="dialog"` を持ち、開閉は自前の `useState`。トリガーボタンは
`triggerDisabled` のとき `disabled` にする（**開いてから押せない、ではなく最初から押せない**）。

- [ ] **Step 4: hook と Container とルートを実装する**

`frontend/src/api/client.ts` に 2 メソッドを追加する。既存メソッドの書き方
（fetch のラップ・エラーの投げ方）に合わせること。

```ts
listOrphanRuns(): Promise<OrphanRunsResponse>
pruneOrphanRuns(strategyIds: string[]): Promise<PruneOrphansResponse>
```

`frontend/src/hooks/useOrphanRuns.ts` を新規作成する。一覧取得・選択状態・削除実行を
まとめ、`MaintenancePage` から使う。`MaintenanceScreen` の props をそのまま作れる形にする。

**空選択のガードは hook 側にも置く**（API 側の 400 に頼らない。2 段にする）。

```ts
const deleteSelected = async (): Promise<void> => {
  // forge は --strategy 省略時に全孤児を削除する。空で投げると
  // サーバ側の 400 が最後の砦になるが、そこに頼らず手前でも止める。
  if (selectedIds.length === 0) return
  ...
}
```

`frontend/src/pages/MaintenancePage.tsx` を新規作成する。ADR-0001 に従い、
hook を呼んで `MaintenanceScreen` に渡すだけにする。lang / theme の扱いは
既存の `IdeasPage.tsx` を読んで合わせること。

`frontend/src/router.tsx` の `children` 配列、`/live` の次に追加する。

```tsx
      {
        path: '/maintenance',
        element: lazyRoute(() => import('./pages/MaintenancePage'), 'MaintenancePage'),
      },
```

`frontend/src/components/AppNav.tsx` の `ITEMS` に追加する。

```tsx
  { to: '/maintenance', ja: '整理', en: 'Maintenance' },
```

- [ ] **Step 5: hook のテストを書いて通す**

`frontend/src/hooks/__tests__/useOrphanRuns.test.tsx` を新規作成する。
`src/hooks/__tests__/useStrategyList.test.tsx` の書き方（`vi.mock('../../api/client')` で
api をモックし、`renderHook` + `waitFor`）に合わせること。最低限これらを固定する。

- 初期状態で一覧を取得し、`orphans` と `totalBytes` を持つ
- 初期状態で `selectedIds` が空
- `toggleId` で選択が付き外れする
- `selectAll` で全件が選択され、`clearSelection` で空になる
- **`selectedIds` が空のとき `deleteSelected` を呼んでも API を呼ばない**
- 削除に成功したら一覧を取り直す
- 削除に失敗したら `error` に入り、`result` は null のまま

- [ ] **Step 6: 判別力を確認する（ablation・3 回）**

1. `MaintenanceScreen` の削除ボタンの `triggerDisabled` から `selectedIds.length === 0` を外す
   → 「選択 0 件では削除ボタンが無効」が落ちること
2. `useOrphanRuns` の `deleteSelected` から「空なら API を呼ばない」ガードを外す
   → hook の該当テストが落ちること
3. `ConfirmDialog` を経由せず削除ボタンから直接 `onDelete` を呼ぶようにする
   → 「削除ボタンを押すと確認を挟み、承認するまで onDelete を呼ばない」が落ちること

- [ ] **Step 7: フロントのゲートを通す**

1 行ずつ別々に実行する。

Run: `cd frontend && pnpm vitest run`
Expected: 全件 PASS

Run: `cd frontend && pnpm run lint`
Expected: exit 0

Run: `cd frontend && pnpm run build`
Expected: exit 0

- [ ] **Step 8: コミット**

```bash
git add frontend/src/hooks/useOrphanRuns.ts frontend/src/screens/MaintenanceScreen.tsx frontend/src/pages/MaintenancePage.tsx frontend/src/api/client.ts frontend/src/router.tsx frontend/src/components/AppNav.tsx frontend/src/hooks/__tests__/useOrphanRuns.test.tsx frontend/src/screens/__tests__/MaintenanceScreen.test.tsx
git commit -m "feat(maintenance): 孤児実行結果を一覧・選択削除する /maintenance 画面を追加"
```

---

## Task 3: E2E・スクリーンショット・ドキュメント

**Files:**
- Create: `frontend/e2e/specs/maintenance.spec.ts`
- Modify: `frontend/src/components/__tests__/AppNav.test.tsx`
- Modify: `docs/screenshots/{ja,en}/*.png`（**全画面**を再撮影）
- Modify: `../alforge-labs/mkdocs_src/{ja,en}/alpha-visualizer/features.md` と ビルド生成物（別リポジトリ・別 PR）

**Interfaces:**
- Consumes: Task 2 で追加した `/maintenance` ルートと AppNav の項目
- Produces: なし（最終タスク）

- [ ] **Step 1: AppNav のテストを更新する**

`frontend/src/components/__tests__/AppNav.test.tsx` を読み、項目数や項目名を検証している
箇所があれば新しい 5 項目に追随させる。**期待値を実装の出力に合わせて緩めるのではなく、
「Maintenance へのリンクがある」ことを積極的に検証するケースを 1 件足す**こと。

Run: `cd frontend && pnpm vitest run src/components/__tests__/AppNav.test.tsx`
Expected: PASS

- [ ] **Step 2: E2E を書く**

`frontend/e2e/specs/maintenance.spec.ts` を新規作成する。

**E2E 環境には `forge` バイナリが無い。** したがって `/maintenance` は「forge 未導入」の
エラー状態を描く。これは実際のユーザーが見る状態なので、そのまま検証対象にする。

既存の `frontend/e2e/specs/browse.spec.ts` を読んで、`gotoBrowse` に相当する
ヘルパーの書き方・`clearViewerSettings` の使い方に合わせること。

固定する内容:

- AppNav に「整理 / Maintenance」のリンクがあり、クリックで `/maintenance` に遷移する
- `/maintenance` を直接開いても 404 にならず画面が描画される
- forge 未導入の環境では、導線付きのエラー（`alforgelabs.com` を含む）が出る

Run: `cd frontend && pnpm run e2e`
Expected: 全件 PASS（既存 14 + 新規）

- [ ] **Step 3: スクリーンショットを再撮影する**

**AppNav は全画面の上部に出るため、項目が 4 → 5 に増えたことで既存のスクリーンショットが
すべて古くなる。** 全画面を撮り直す。

Run: `cd frontend && pnpm run screenshots`
Expected: exit 0。`docs/screenshots/{ja,en}/` の複数ファイルが更新される

Run: `git status --short docs/screenshots/`
Expected: browse / detail / compare / ideas 等、複数の png が変更されている（AppNav の分）

- [ ] **Step 4: 全ゲートを通す**

1 行ずつ別々に実行する。

Run: `uv run pytest tests/ -q`
Expected: 全件 PASS

Run: `uv run ruff check src/ tests/`
Expected: exit 0

Run: `cd frontend && pnpm vitest run`
Expected: 全件 PASS

Run: `cd frontend && pnpm run lint`
Expected: exit 0

Run: `cd frontend && pnpm run build`
Expected: exit 0

Run: `cd frontend && pnpm run e2e`
Expected: 全件 PASS

- [ ] **Step 5: 実データで動作を確認する**

`forge` が PATH に無いと画面が動かないため、まず forge を PATH に通せるか確認する。
通せない場合はこの Step をスキップし、レポートにその旨を書くこと。

```bash
cd /Users/sakae/dev/alpha-trade/alpha-visualizer
uv run alpha-vis serve --forge-dir ../alpha-strategies --port 8919
```

ブラウザで `http://127.0.0.1:8919/maintenance` を開き、次を確認する。

- 一覧に **128 件 / 83.4 MB** 前後が出る（フェーズ 1 の実測値）
- 組み込みテンプレート戦略（`macd_crossover_v1` / `sma_crossover_v1` 等）が**含まれない**
- 既定で 1 件も選択されていない

**削除は絶対に実行しないでください。** 一覧の表示確認までにとどめること。実測値をレポートに書く。

- [ ] **Step 6: コミット**

```bash
git add frontend/e2e/specs/maintenance.spec.ts frontend/src/components/__tests__/AppNav.test.tsx docs/screenshots/
git commit -m "test(maintenance): /maintenance の E2E を追加しスクリーンショットを再撮影"
```

- [ ] **Step 7: alforge-labs のドキュメントを更新する（別リポジトリ）**

`git -C /Users/sakae/dev/alpha-trade/alforge-labs ...` を使う。`cd` でサブリポジトリを
またがない（`mkdocs build` の実行時のみ `cd` してよい）。

`mkdocs_src/{ja,en}/alpha-visualizer/features.md` に `/maintenance` 画面の節を追加する。
既存の「Browse 画面」「Detail 画面」等と同じ書式に合わせ、日英セットで書く。内容:

- 何をする画面か（戦略定義がもう存在しない実行結果を一覧し、選んで削除する）
- **孤児は必ずしも不要なデータではない**こと（`strategy delete` は `--with-results` 無しで
  結果を意図的に残す）。削除は不可逆
- 既定で 1 件も選択されていないこと
- `alpha-forge` が必要なこと（一覧・削除とも forge CLI に委譲している）

```bash
cd /Users/sakae/dev/alpha-trade/alforge-labs && uv run mkdocs build -f mkdocs.ja.yml
cd /Users/sakae/dev/alpha-trade/alforge-labs && uv run mkdocs build -f mkdocs.en.yml
```

生成物もコミットに含める。ブランチは `docs/maintenance-orphan-runs` を新規作成する。

```bash
git -C /Users/sakae/dev/alpha-trade/alforge-labs checkout -b docs/maintenance-orphan-runs
git -C /Users/sakae/dev/alpha-trade/alforge-labs add -A
git -C /Users/sakae/dev/alpha-trade/alforge-labs commit -m "docs(visualizer): /maintenance 画面を機能詳細に追加"
```
