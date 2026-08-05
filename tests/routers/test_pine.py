"""pine ルーターのテスト（forge CLI 委譲・issue #487）。

`POST /api/pine/{strategy_id}` は `alpha-forge pine preview --strategy <id>` に
委譲し、stdout の Pine Script 本文をそのまま返す。`pine generate` のファイル
出力パス（forge.yaml の pinescript.output_path）を visualizer 側で解決しない
ため、preview を使う（設定解釈の複製を避ける・epic #483 の設計判断）。
"""

from __future__ import annotations

import json
import pathlib
from unittest import mock

from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app

PINE_SCRIPT = (
    "//@version=6\n"
    'strategy("cl_hmm_bb_rsi_v1", overlay=true)\n'
    "longCondition = ta.crossover(ta.sma(close, 5), ta.sma(close, 20))\n"
)


def _proc(returncode: int = 0, stdout: str = "", stderr: str = "") -> mock.Mock:
    return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)


class TestPinePreview:
    def test_生成したPine本文を返す(self, client: TestClient) -> None:
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=PINE_SCRIPT)
            ) as run_mock,
        ):
            resp = client.post("/api/pine/cl_hmm_bb_rsi_v1")

        assert resp.status_code == 200
        body = resp.json()
        assert body["strategy_id"] == "cl_hmm_bb_rsi_v1"
        assert body["filename"] == "cl_hmm_bb_rsi_v1.pine"
        assert body["script"].startswith("//@version=6")
        assert "longCondition" in body["script"]

        # 読み取り（preview）への完全一致。generate（ファイル生成）を呼ばない
        argv = run_mock.call_args[0][0]
        assert argv[1:] == ["pine", "preview", "--strategy", "cl_hmm_bb_rsi_v1"]

    def test_forge未導入なら503と機械可読codeを返す(self, client: TestClient) -> None:
        with mock.patch("shutil.which", return_value=None):
            resp = client.post("/api/pine/s1")

        assert resp.status_code == 503
        assert resp.json()["code"] == "forge_cli_not_found"

    def test_Trialの拒否は有料プラン案内へ変換される(self, client: TestClient) -> None:
        """forge の entitlement 拒否（rich パネル出力）は生のまま出さず、
        アップグレード導線 + 既購入者の認証復帰導線を含む定型文へ変換する
        （issue #488）。
        """
        panel = (
            "╭─────────────────────────────────────────╮\n"
            "│ Pine Script エクスポートは有料プラン（Lifetime / Annual / Monthly）│\n"
            "│ のみ利用できます。                        │\n"
            "╰─────────────────────────────────────────╯"
        )
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(returncode=1, stdout=panel)
            ),
        ):
            resp = client.post("/api/pine/s1")

        assert resp.status_code >= 400
        detail = resp.json()["detail"]
        # rich パネルの罫線をそのまま見せない
        assert "╭" not in detail
        assert "有料プラン" in detail
        assert "paid plans" in detail
        # アップグレード導線と既購入者の認証復帰導線の両方を含む
        assert "https://alforgelabs.com/ja/index.html#pricing" in detail
        assert "alpha-forge system auth login" in detail

    def test_不正なstrategy_idは422(self, client: TestClient) -> None:
        # forge argv への素通しを境界で塞ぐ（先頭ハイフンのオプション偽装等）
        resp = client.post("/api/pine/-evil")
        assert resp.status_code == 422

    def test_非loopback公開中は403で拒否する(self, tmp_path: pathlib.Path) -> None:
        """Premium 機能の実行は書き込み系と同じく localhost 限定（#485 のガード共用）。"""
        app = create_app(forge_dir=tmp_path, local_write_enabled=False)
        with TestClient(app) as client:
            resp = client.post("/api/pine/s1")
        assert resp.status_code == 403
        assert resp.json()["code"] == "local_write_disabled"


INDICATOR_LIST_JSON = json.dumps({
    "indicators": [
        {"name": "SMA", "category": "移動平均", "desc": "単純移動平均", "pine_supported": True},
        {"name": "RSI", "category": "モメンタム", "desc": "相対力指数", "pine_supported": True},
        {"name": "KAMA", "category": "移動平均", "desc": "適応型移動平均", "pine_supported": False},
        {"name": "ALTDATA", "category": "高度な機能", "desc": "代替データ", "pine_supported": False},
    ],
})


def _client_with_strategy(
    tmp_path: pathlib.Path, indicators: list[dict[str, object]]
) -> TestClient:
    strategies_dir = tmp_path / "data" / "strategies"
    strategies_dir.mkdir(parents=True, exist_ok=True)
    (strategies_dir / "s1.json").write_text(
        json.dumps({
            "strategy_id": "s1",
            "name": "テスト戦略",
            "timeframe": "1d",
            "parameters": {},
            "indicators": indicators,
        }),
        encoding="utf-8",
    )
    return TestClient(create_app(forge_dir=tmp_path))


class TestPineSupport:
    """GET /api/pine/{strategy_id}/support（issue #488 非対応指標の事前警告）。

    対応表の SSoT は forge 側（`analyze indicator list --json`）。visualizer に
    対応指標をハードコードしない。
    """

    def test_戦略の指標を対応表と突合して返す(self, tmp_path: pathlib.Path) -> None:
        client = _client_with_strategy(tmp_path, [
            {"id": "sma_fast", "type": "SMA", "params": {}},
            {"id": "kama_1", "type": "KAMA", "params": {}},
        ])
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(stdout=INDICATOR_LIST_JSON)
            ) as run_mock,
        ):
            resp = client.get("/api/pine/s1/support")

        assert resp.status_code == 200
        body = resp.json()
        assert body["strategy_id"] == "s1"
        by_id = {i["id"]: i for i in body["indicators"]}
        assert by_id["sma_fast"]["pine_supported"] is True
        assert by_id["kama_1"]["pine_supported"] is False
        assert body["unsupported_types"] == ["KAMA"]
        assert body["all_unsupported"] is False

        argv = run_mock.call_args[0][0]
        assert argv[1:] == ["analyze", "indicator", "list", "--json"]

    def test_全指標が非対応なら強警告フラグを立てる(self, tmp_path: pathlib.Path) -> None:
        client = _client_with_strategy(tmp_path, [
            {"id": "kama_1", "type": "KAMA", "params": {}},
            {"id": "alt_1", "type": "ALTDATA", "params": {}},
        ])
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=INDICATOR_LIST_JSON)),
        ):
            resp = client.get("/api/pine/s1/support")

        body = resp.json()
        assert sorted(body["unsupported_types"]) == ["ALTDATA", "KAMA"]
        assert body["all_unsupported"] is True

    def test_指標を持たない戦略は警告なし(self, tmp_path: pathlib.Path) -> None:
        client = _client_with_strategy(tmp_path, [])
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=INDICATOR_LIST_JSON)),
        ):
            resp = client.get("/api/pine/s1/support")

        body = resp.json()
        assert body["indicators"] == []
        assert body["unsupported_types"] == []
        assert body["all_unsupported"] is False

    def test_対応表に無い指標型は非対応として警告する(self, tmp_path: pathlib.Path) -> None:
        """判定できない指標を「対応」と見せると TradingView で動かない事故になる。
        保守側（非対応扱い）に倒す。
        """
        client = _client_with_strategy(tmp_path, [
            {"id": "x1", "type": "NEWTYPE", "params": {}},
        ])
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=INDICATOR_LIST_JSON)),
        ):
            resp = client.get("/api/pine/s1/support")

        assert resp.json()["unsupported_types"] == ["NEWTYPE"]

    def test_戦略が無ければ404(self, tmp_path: pathlib.Path) -> None:
        client = _client_with_strategy(tmp_path, [])
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch("subprocess.run", return_value=_proc(stdout=INDICATOR_LIST_JSON)),
        ):
            resp = client.get("/api/pine/unknown/support")

        assert resp.status_code == 404
