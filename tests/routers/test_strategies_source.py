"""source（実行元 provenance・vis#299）のルーターテスト。

`backtest run --strategy-file`（チューニング試行）のランを Run History /
Browse 一覧で区別するため、`/api/strategies` の ``latest_source`` と
`/api/strategies/{id}` の ``results[].source`` を検証する。
"""

from __future__ import annotations

import pathlib
import sqlite3
import textwrap

from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig
from tests.factories import build_backtest_db, build_strategies_db


def _make_client(tmp_path: pathlib.Path, *, source: str | None) -> TestClient:
    """backtest DB（run_aapl_001）+ strategies.db を持つクライアントを作る。

    ``source`` が None 以外なら run_aapl_001 の source を更新する。
    """
    db_path = tmp_path / "data" / "results" / "backtest_results.db"
    build_backtest_db(db_path)
    if source is not None:
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE backtest_results SET source = ? WHERE run_id = 'run_aapl_001'",
                (source,),
            )
    build_strategies_db(
        tmp_path / "data" / "strategies" / "strategies.db",
        strategy_id="ema_cross_aapl",
        name="EMA クロス AAPL",
    )
    (tmp_path / "forge.yaml").write_text(
        textwrap.dedent(
            """
            report:
              output_path: ./data/results
              db_filename: backtest_results.db
            strategies:
              path: ./data/strategies
              use_db: true
              db_filename: strategies.db
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    config = ForgeConfig.from_forge_dir(tmp_path)
    return TestClient(create_app(config=config))


class TestRunSourceExposure:
    def test_一覧のlatest_sourceにチューニング試行が出る(
        self, tmp_path: pathlib.Path
    ) -> None:
        # WHY: Browse 一覧の latest 指標が保存していない試行ランに
        # すり替わったことに気づけるようにする（vis#299 受け入れ条件）
        client = _make_client(tmp_path, source="strategy-file")
        response = client.get("/api/strategies")
        assert response.status_code == 200
        item = response.json()[0]
        assert item["latest_source"] == "strategy-file"

    def test_詳細のresultsにsourceが含まれる(self, tmp_path: pathlib.Path) -> None:
        client = _make_client(tmp_path, source="strategy-file")
        response = client.get("/api/strategies/ema_cross_aapl")
        assert response.status_code == 200
        results = response.json()["results"]
        assert results[0]["run_id"] == "run_aapl_001"
        assert results[0]["source"] == "strategy-file"

    def test_source未記録の行はnull(self, tmp_path: pathlib.Path) -> None:
        # 旧 forge が書いた行（source NULL）は「不明」としてそのまま null
        client = _make_client(tmp_path, source=None)
        list_response = client.get("/api/strategies")
        assert list_response.json()[0]["latest_source"] is None
        detail_response = client.get("/api/strategies/ema_cross_aapl")
        assert detail_response.json()["results"][0]["source"] is None
