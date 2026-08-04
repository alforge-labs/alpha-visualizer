"""pine ルーターのテスト（forge CLI 委譲・issue #487）。

`POST /api/pine/{strategy_id}` は `alpha-forge pine preview --strategy <id>` に
委譲し、stdout の Pine Script 本文をそのまま返す。`pine generate` のファイル
出力パス（forge.yaml の pinescript.output_path）を visualizer 側で解決しない
ため、preview を使う（設定解釈の複製を避ける・epic #483 の設計判断）。
"""

from __future__ import annotations

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

    def test_forgeが非ゼロ終了したらエラー内容を伝える(self, client: TestClient) -> None:
        """Trial の entitlement 拒否など。表示の作り込みは issue #488 で行うが、
        経路としては detail に CLI の出力（次の一歩を含む）が渡ること。
        """
        panel = (
            "Pine Script エクスポートは有料プラン（Lifetime / Annual / Monthly）"
            "のみ利用できます。\nアップグレード: https://alforgelabs.com/pricing"
        )
        with (
            mock.patch("shutil.which", return_value="/usr/local/bin/alpha-forge"),
            mock.patch(
                "subprocess.run", return_value=_proc(returncode=1, stdout=panel)
            ),
        ):
            resp = client.post("/api/pine/s1")

        assert resp.status_code >= 400
        assert "有料プラン" in resp.json()["detail"]

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
