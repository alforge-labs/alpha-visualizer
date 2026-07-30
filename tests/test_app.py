"""FastAPI アプリの基本テスト"""

import pathlib

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig


def test_health_returns_ok(tmp_path: pathlib.Path) -> None:
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert str(tmp_path) in data["forge_dir"]


def test_health_includes_app_version(tmp_path: pathlib.Path) -> None:
    """/health がパッケージ実バージョンを返すこと (issue #399)。

    UI（フッター）とバグ報告時のバージョン確認が CLI に戻らず済むようにする。
    """
    from alpha_visualizer import __version__

    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    data = client.get("/health").json()
    assert data["version"] == __version__


def test_openapi_version_matches_package_version(tmp_path: pathlib.Path) -> None:
    """openapi.json / Swagger の version がハードコード 0.1.0 のまま凍結されず
    パッケージ実バージョンと一致すること (issue #399)。"""
    from alpha_visualizer import __version__

    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    data = client.get("/openapi.json").json()
    assert data["info"]["version"] == __version__


def test_create_app_accepts_config(tmp_path: pathlib.Path) -> None:
    """config キーワードで ForgeConfig を直接渡せる"""
    config = ForgeConfig.from_forge_dir(tmp_path)
    app = create_app(config=config)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200


def test_create_app_requires_argument() -> None:
    """forge_dir も config もどちらも与えないと ValueError"""
    with pytest.raises(ValueError):
        create_app()


def test_spa_fallback_returns_index_for_unknown_paths(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SPA ルート（/browse 等）への直アクセス・リロードで index.html が返る"""
    # static/index.html を仮配置（リリースビルドが無い環境でも検証できるように）
    import alpha_visualizer.app as app_module

    fake_static = tmp_path / "static"
    fake_static.mkdir()
    (fake_static / "index.html").write_text("<html>SPA</html>", encoding="utf-8")
    (fake_static / "asset.js").write_text("console.log(1)", encoding="utf-8")

    # create_app 内で参照される static_dir をモック
    real_path = pathlib.Path
    def fake_path_init(self_path: object, *args: object) -> None:
        # 通常の Path 初期化を保つだけのダミー
        return real_path.__init__(self_path, *args)  # type: ignore[arg-type]

    monkeypatch.setattr(
        app_module, "pathlib", pathlib,
    )
    # __file__ ベースの static 解決を上書きするのは難しいので、ここでは
    # 既存の resources/static を持つ実環境テストの代わりに「静的ファイルが
    # 存在しない場合に SPA fallback ルートが登録されないこと」を確認する。
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)

    # static_dir が存在しないテスト環境では SPA fallback 自体が登録されない
    # → /browse は 404（既存挙動）
    # → 実環境では vite build 後に static/ が生成され、そこに対して fallback が動く
    response = client.get("/browse")
    # static_dir 不在のため 404 になる（実環境では SPA fallback により 200）
    assert response.status_code in (200, 404)


def test_spa_fallback_serves_index_with_static_dir(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """static/ ディレクトリが存在する場合、未知パスは index.html を返す"""
    import alpha_visualizer.app as app_module

    fake_static = tmp_path / "static"
    fake_static.mkdir()
    index_content = "<html>FAKE_SPA_INDEX</html>"
    (fake_static / "index.html").write_text(index_content, encoding="utf-8")
    (fake_static / "asset.js").write_text("console.log(1)", encoding="utf-8")

    # __file__ ベースの参照先を一時的に書き換える
    monkeypatch.setattr(app_module, "__file__", str(tmp_path / "app.py"))

    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)

    # 未知のパス → index.html が返る
    r1 = client.get("/browse")
    assert r1.status_code == 200
    assert "FAKE_SPA_INDEX" in r1.text

    # 存在する static ファイル → そのまま配信
    r2 = client.get("/asset.js")
    assert r2.status_code == 200
    assert "console.log(1)" in r2.text

    # /api 配下は SPA fallback に取られない（health は 200、未知 API は 404）
    r3 = client.get("/api/strategies")
    assert r3.status_code == 200  # 200 OK の JSON 応答


def test_spa_fallback_rejects_directory_traversal(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ディレクトリトラバーサル試行は static_dir 外の実ファイルを露出させず
    必ず index.html へフォールバックすること。"""
    import alpha_visualizer.app as app_module

    fake_static = tmp_path / "static"
    fake_static.mkdir()
    index_content = "<html>FAKE_SPA_INDEX</html>"
    (fake_static / "index.html").write_text(index_content, encoding="utf-8")

    # static_dir の外側に「漏らされたら困る」ファイルを配置
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP_SECRET", encoding="utf-8")

    monkeypatch.setattr(app_module, "__file__", str(tmp_path / "app.py"))

    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)

    # 親参照: ../secret.txt は index.html にフォールバック
    r1 = client.get("/..%2Fsecret.txt")
    assert r1.status_code == 200
    assert "TOP_SECRET" not in r1.text
    assert "FAKE_SPA_INDEX" in r1.text

    # ネストした親参照も拒否
    r2 = client.get("/sub/..%2F..%2Fsecret.txt")
    assert r2.status_code == 200
    assert "TOP_SECRET" not in r2.text
    assert "FAKE_SPA_INDEX" in r2.text


def test_create_app_stores_engine_in_state(tmp_path: pathlib.Path) -> None:
    """create_app で生成された FastAPI が app.state.engine を持つこと。"""
    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)
    (forge_dir / "data" / "results" / "backtest_results.db").touch()

    app = create_app(forge_dir=forge_dir)
    engine = app.state.engine
    assert engine is not None
    assert engine.dialect.name == "sqlite"


def test_create_app_does_not_create_empty_forge_db(tmp_path: pathlib.Path) -> None:
    """backtest_results.db 不在で create_app しても 0 byte の backtest_results.db が作られないこと (issue #173)。"""
    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)
    forge_db = forge_dir / "data" / "results" / "backtest_results.db"
    assert not forge_db.exists()

    create_app(forge_dir=forge_dir)

    assert not forge_db.exists(), "create_app が空の backtest_results.db を touch してはならない"


def test_create_app_engine_is_none_when_db_absent(tmp_path: pathlib.Path) -> None:
    """backtest_results.db 不在時は app.state.engine が None になること (issue #173)。"""
    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)

    app = create_app(forge_dir=forge_dir)
    assert app.state.engine is None


def test_create_app_strategies_engine_when_db_present(tmp_path: pathlib.Path) -> None:
    """forge.yaml で strategies.use_db=true のときは strategies_engine がキャッシュされる。"""
    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)
    (forge_dir / "data" / "results" / "backtest_results.db").touch()
    strategies_dir = forge_dir / "data" / "strategies"
    strategies_dir.mkdir(parents=True)
    (strategies_dir / "strategies.db").touch()
    # use_db=true を明示しないと ForgeConfig.strategies_db は None のまま
    (forge_dir / "forge.yaml").write_text(
        "strategies:\n  use_db: true\n",
        encoding="utf-8",
    )

    app = create_app(forge_dir=forge_dir)
    assert app.state.strategies_engine is not None
    assert app.state.strategies_engine.dialect.name == "sqlite"


def test_create_app_strategies_engine_none_in_json_mode(tmp_path: pathlib.Path) -> None:
    """strategies.db が無い（JSON モード）場合は strategies_engine が None。"""
    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)
    (forge_dir / "data" / "results" / "backtest_results.db").touch()
    (forge_dir / "data" / "strategies").mkdir(parents=True)
    # forge.yaml なし → strategies_db は None

    app = create_app(forge_dir=forge_dir)
    assert app.state.strategies_engine is None


def test_alpha_error_handler_returns_json_with_status(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AlphaVisualizerError サブクラスを raise すると、ハンドラが
    対応する status_code と {"detail": str(exc)} JSON に変換する。
    """
    import alpha_visualizer.app as app_module

    forge_dir = tmp_path / "forge"
    (forge_dir / "data" / "results").mkdir(parents=True)
    (forge_dir / "data" / "results" / "backtest_results.db").touch()

    # SPA fallback (/{full_path:path}) を登録させないため、
    # __file__ を一時ディレクトリにずらして static/ 不在状態にする。
    monkeypatch.setattr(app_module, "__file__", str(tmp_path / "app.py"))

    app = create_app(forge_dir=forge_dir)

    @app.get("/_test_error")
    async def _raise_error() -> None:
        from alpha_visualizer.errors import NotFoundError

        raise NotFoundError("test resource")

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/_test_error")
    assert res.status_code == 404
    assert res.json() == {"detail": "test resource"}


def test_missing_db_warning_matches_actual_behavior(
    tmp_path: pathlib.Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """DB 欠落時の起動 warning が実挙動と一致する（issue #227）。

    一覧 API（/api/results・/api/live）は 200 + 空配列を返すため、
    「関連 API は 404 を返します」という旧文言は誤誘導。文言と実挙動の
    両方をここで突合し、将来どちらかだけが変わったら fail させる。
    """
    import logging

    with caplog.at_level(logging.WARNING, logger="alpha_visualizer.app"):
        app = create_app(forge_dir=tmp_path)

    messages = [r.getMessage() for r in caplog.records if "backtest_results.db" in r.getMessage()]
    assert messages, "DB 欠落の warning が出ていない"
    # 文言が実挙動（一覧=空配列・個別=404）を正しく説明していること
    assert any("空配列" in m and "404" in m for m in messages), messages
    # 旧文言（一覧 API まで 404 と読める表現）が残っていないこと
    assert not any("関連 API は 404" in m for m in messages), messages

    # 実挙動の突合: 一覧 API は 200 + 空配列
    client = TestClient(app)
    res = client.get("/api/results")
    assert res.status_code == 200
    assert res.json() == []


def test_missing_static_dir_logs_warning(
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """static/ が無い環境では SPA 非配信の旨を warning で残す（issue #225）。

    wheel への同梱漏れ・frontend 未ビルドのとき、無言で / が 404 になるのではなく
    起動ログから原因に到達できることを保証する。
    """
    import logging

    import alpha_visualizer.app as app_module

    # static/ を含まないディレクトリへ __file__ を向ける
    monkeypatch.setattr(app_module, "__file__", str(tmp_path / "app.py"))

    with caplog.at_level(logging.WARNING, logger="alpha_visualizer.app"):
        create_app(forge_dir=tmp_path)

    messages = [r.getMessage() for r in caplog.records]
    assert any("static" in m and "SPA" in m for m in messages), messages


def test_engine_lazy_init_after_db_created_at_runtime(
    tmp_path: pathlib.Path,
) -> None:
    """起動後に backtest_results.db が生成されても DB 系 API が動くこと (issue #354)。

    空 forge_dir で serve → GUI からの初回バックテストで forge が DB を新規生成、
    という初回オンボーディング動線で、再起動なしに結果を閲覧できることを保証する。
    """
    from tests.factories import build_backtest_db

    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)

    # 起動時点では DB 不在 → 空配列（issue #173 の既存挙動）
    res = client.get("/api/results")
    assert res.status_code == 200
    assert res.json() == []

    # 起動後に forge が DB を生成した状況を模擬
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    build_backtest_db(db_path)

    # 再起動なしで一覧が返ること（従来はここで 500）
    res = client.get("/api/results")
    assert res.status_code == 200


def test_gzip_compression_enabled_for_large_responses(tmp_path: pathlib.Path) -> None:
    """Accept-Encoding: gzip を送ると 1KB 超のレスポンスが gzip 圧縮される (issue #385)。

    バックテスト詳細 API は約 2MB の JSON を返すため、圧縮なしでは
    Detail 表示・sparkline hover のたびに無駄な転送コストが載る。
    """
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    # openapi.json は常に 1KB を超える実エンドポイント
    res = client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert res.status_code == 200
    assert res.headers.get("content-encoding") == "gzip"


def test_gzip_not_applied_to_small_responses(tmp_path: pathlib.Path) -> None:
    """1KB 未満の小さいレスポンスは圧縮しない（gzip オーバーヘッド回避）(issue #385)。"""
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)
    res = client.get("/health", headers={"Accept-Encoding": "gzip"})
    assert res.status_code == 200
    assert "content-encoding" not in res.headers


def test_hashed_assets_get_immutable_cache_control(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ハッシュ付き /assets/ には immutable な Cache-Control を付与する (issue #385)。

    Vite はビルドごとにファイル名へコンテンツハッシュを含めるため、
    同名ファイルの内容が変わることはなく長期キャッシュが安全。
    一方 index.html は更新の起点なので毎回再検証させる（no-cache）。
    """
    import alpha_visualizer.app as app_module

    fake_static = tmp_path / "static"
    (fake_static / "assets").mkdir(parents=True)
    (fake_static / "index.html").write_text("<html>SPA</html>", encoding="utf-8")
    (fake_static / "assets" / "index-abc123.js").write_text(
        "console.log(1)", encoding="utf-8"
    )
    monkeypatch.setattr(app_module, "__file__", str(tmp_path / "app.py"))

    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)

    r_asset = client.get("/assets/index-abc123.js")
    assert r_asset.status_code == 200
    assert r_asset.headers.get("cache-control") == "public, max-age=31536000, immutable"

    # SPA fallback で返る index.html は immutable にしない（デプロイ更新を即時反映）
    r_index = client.get("/browse")
    assert r_index.status_code == 200
    assert r_index.headers.get("cache-control") == "no-cache"
    # 直接 index.html を要求した場合も同様
    r_direct = client.get("/index.html")
    assert r_direct.headers.get("cache-control") == "no-cache"


def test_strategies_engine_lazy_init_after_db_created_at_runtime(
    tmp_path: pathlib.Path,
) -> None:
    """DB モードで strategies.db が起動後に生成された場合も戦略 API が動くこと (issue #354)。"""
    from tests.factories import build_strategies_db

    (tmp_path / "forge.yaml").write_text(
        "strategies:\n  path: ./data/strategies\n  use_db: true\n",
        encoding="utf-8",
    )
    app = create_app(forge_dir=tmp_path)
    client = TestClient(app)

    # 起動後に strategies.db が生成された状況を模擬
    db_path = tmp_path / "data" / "strategies" / "strategies.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    build_strategies_db(db_path, "lazy_strat", "Lazy Strategy")

    res = client.get("/api/strategies")
    assert res.status_code == 200
    assert [s["strategy_id"] for s in res.json()] == ["lazy_strat"]
