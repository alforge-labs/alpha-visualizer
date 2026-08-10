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
from alpha_visualizer.services.forge_cli import FORGE_EULA_NOT_ACCEPTED_MESSAGE

FORGE_SELF_VERSION = {
    "current_version": "1.9.2",
    "latest_version": "1.9.3",
    "latest_url": "https://example.invalid/releases/v1.9.3",
    "update_available": True,
    "is_dev_build": False,
    "error": None,
}


def _job_record(kind: str) -> Any:
    from datetime import UTC, datetime

    from alpha_visualizer.services.jobs import JobRecord

    return JobRecord(
        job_id="job-test000000",
        kind=kind,  # type: ignore[arg-type]
        strategy_id="",
        symbol="",
        trials=None,
        windows=None,
        created_at=datetime.now(UTC),
    )


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


def test_Windowsでも最新版ならmessageは出ない(remote_workspace: pathlib.Path) -> None:
    """updatable=False と update_available=False が両立する（Windows かつ最新版）とき、
    Windows 向けの手動更新案内を出さない（レビュー指摘の回帰テスト）。

    案内が常時出ると、最新版を使っている Windows ユーザーにも
    「やるべき作業がある」ように見えてしまう。
    """
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch("alpha_visualizer.routers.versions.sys.platform", "win32"),
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version",
            return_value=__version__,
        ),
    ):
        res = client.get("/api/versions")
    vis = _components(res.json())["visualizer"]
    assert vis["updatable"] is False
    assert vis["update_available"] is False
    assert vis["message"] is None


def test_fetch_latest_versionが例外を出しても他は巻き込まれない(remote_workspace: pathlib.Path) -> None:
    """degraded 設計の核（レビュー指摘の回帰テスト）。

    fetch_latest_version は契約上 None 以外の例外を送出しないはずだが、想定外の例外が
    出た場合でも asyncio.gather 全体が落ちて forge / strike を巻き込んではいけない。
    """
    _write_strike_meta(
        remote_workspace, {"version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"}
    )
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            return_value=FORGE_SELF_VERSION,
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version",
            side_effect=RuntimeError("PyPI 応答の解析に失敗しました"),
        ),
    ):
        res = client.get("/api/versions")
    assert res.status_code == 200
    comps = _components(res.json())
    assert comps["forge"]["status"] == "ok"
    assert comps["strike"]["status"] == "ok"
    assert comps["visualizer"]["status"] == "ok"
    assert comps["visualizer"]["current"] == __version__
    assert comps["visualizer"]["latest"] is None
    assert comps["visualizer"]["update_available"] is False


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
        # create をモックしているため実ジョブは _jobs に登録されない。
        # 応答後にバックグラウンドで起動する再起動監視タスク（Task 7）が
        # 実装の wait_terminal を呼んで KeyError を起こさないようにする
        mock.patch(
            "alpha_visualizer.services.jobs.JobManager.wait_terminal",
            new_callable=mock.AsyncMock,
        ) as wait_terminal,
    ):
        create.return_value = _job_record("visualizer_self_update")
        wait_terminal.return_value = create.return_value
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


def test_serverが未設定なら再起動フラグを立てない(tmp_path: pathlib.Path) -> None:
    """``uvicorn_server`` が None の経路（``alpha-vis serve`` 以外での起動）で、
    フラグだけが立って誰も再起動を実行しない状態を残さない（レビュー指摘の回帰テスト）。
    """
    import asyncio

    from alpha_visualizer.routers.versions import _restart_after_success

    app = create_app(forge_dir=tmp_path)
    assert app.state.uvicorn_server is None

    succeeded = _job_record("visualizer_self_update")
    succeeded.status = "succeeded"
    manager = mock.Mock()
    manager.wait_terminal = mock.AsyncMock(return_value=succeeded)

    asyncio.run(_restart_after_success(app, manager, "job-test000000"))
    assert app.state.restart_requested is False


def test_strikeメタ読み取りが例外を出しても他は巻き込まれない(remote_workspace: pathlib.Path) -> None:
    """degraded 設計の核（レビュー指摘の回帰テスト）。

    _read_strike_meta は契約上 None 以外の例外を送出しないはずだが、想定外の例外が
    出た場合でも forge / visualizer を巻き込まず、strike だけ unknown に落ちること。
    """
    _write_strike_meta(
        remote_workspace, {"version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"}
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
        mock.patch(
            "alpha_visualizer.routers.versions._read_strike_meta",
            side_effect=RuntimeError("_meta.json の読み取りに失敗しました"),
        ),
    ):
        res = client.get("/api/versions")
    assert res.status_code == 200
    comps = _components(res.json())
    assert comps["forge"]["status"] == "ok"
    assert comps["visualizer"]["status"] == "ok"
    assert comps["strike"]["status"] == "unknown"
    assert comps["strike"]["current"] is None


def test_message_には機械可読codeが伴う(remote_workspace: pathlib.Path) -> None:
    """UI は文字列のパターンマッチではなく code で表示言語の文言へ写像する。

    サーバーの message は curl 利用者向けの日英連結なので、そのまま UI へ出すと
    英語表示のユーザーに日本語が先に見える（issue #358 と同じ問題）。
    code が欠けるとフロントは写像先を選べず、日英連結へフォールバックしてしまう。
    """
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            side_effect=ExternalProcessError("forge が異常終了しました"),
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="1.0.5"
        ),
    ):
        res = client.get("/api/versions")
    comps = _components(res.json())
    # forge 取得失敗と strike 未同期は、どちらも案内文と code が対になる
    assert comps["forge"]["code"] == "forge_version_unknown"
    assert comps["forge"]["message"] is not None
    assert comps["strike"]["code"] == "strike_not_synced"
    assert comps["strike"]["message"] is not None
    # 正常なコンポーネントには案内が無いので code も付かない
    assert comps["visualizer"]["code"] is None


def test_Windowsの手動更新案内にもcodeが付く(remote_workspace: pathlib.Path) -> None:
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
    assert vis["code"] == "windows_manual_update"


def test_EULA未同意は専用codeと案内へ変換する(remote_workspace: pathlib.Path) -> None:
    """forge の EULA 再同意待ちを「未導入または実行に失敗」に丸めない。

    EULA は改訂のたびに再同意が必要で、self update 直後に必ず通る経路である
    （実際に v1.4.0 への更新後、この画面が原因不明の「不明」を表示した）。
    forge_cli.translate_forge_failure が既に次の一歩を示す案内へ変換済みなのに、
    例外を一律で握って汎用文言に置き換えると、その案内が利用者へ届かない。
    /api/setup/status は同じ状況を eula: attention として出し分けている。
    """
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            side_effect=ExternalProcessError(FORGE_EULA_NOT_ACCEPTED_MESSAGE),
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value="1.5.0"
        ),
    ):
        res = client.get("/api/versions")

    assert res.status_code == 200
    forge = _components(res.json())["forge"]
    assert forge["status"] == "unknown"
    assert forge["code"] == "forge_eula_not_accepted"
    # 次の一歩（同意コマンド）が利用者に届くこと
    assert "system doctor" in (forge["message"] or "")
    # EULA 未同意は forge の問題であり、他コンポーネントは巻き込まれない
    assert _components(res.json())["visualizer"]["status"] == "ok"


def test_EULA以外の失敗は汎用の不明のまま(remote_workspace: pathlib.Path) -> None:
    """EULA 判定を入れたことで、原因不明の失敗まで EULA 扱いにしない。"""
    client = TestClient(create_app(forge_dir=remote_workspace))
    with (
        mock.patch(
            "alpha_visualizer.routers.versions.run_forge_json",
            side_effect=ExternalProcessError("forge が異常終了しました（exit 2）"),
        ),
        mock.patch(
            "alpha_visualizer.routers.versions.fetch_latest_version", return_value=None
        ),
    ):
        res = client.get("/api/versions")
    forge = _components(res.json())["forge"]
    assert forge["code"] == "forge_version_unknown"
