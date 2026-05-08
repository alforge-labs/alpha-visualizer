"""strategies ルーターのテスト（戦略一覧・詳細・比較・JSON フォールバック）。"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import textwrap

from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from alpha_visualizer.app import create_app
from alpha_visualizer.db import metadata, strategies
from alpha_visualizer.forge_config import ForgeConfig


class TestStrategiesRouter:
    def test_list_strategies_no_dir(self, client: TestClient) -> None:
        """strategies_dir が存在しない場合は空リストを返す"""
        response = client.get("/api/strategies")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_strategies_with_files(self, client_with_strategies: TestClient) -> None:
        """strategies_dir に JSON ファイルがある場合はリストを返す。
        timeframe は戦略 JSON から取得され、バックテスト履歴がない latest_* は null。"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        item = data[0]
        assert item["strategy_id"] == "test_strategy"
        assert item["name"] == "テスト戦略"
        assert item["timeframe"] == "1h"
        # バックテスト履歴がないので latest_* は null
        assert item["symbol"] is None
        assert item["latest_sharpe"] is None
        assert item["latest_max_drawdown_pct"] is None
        assert item["latest_profit_factor"] is None
        assert item["latest_win_rate_pct"] is None

    def test_list_strategies_includes_tags_and_target_symbols(
        self, tmp_path: pathlib.Path
    ) -> None:
        """戦略 JSON に含まれる tags / target_symbols が一覧 API レスポンスに露出される"""
        strategies_dir = tmp_path / "data" / "strategies"
        strategies_dir.mkdir(parents=True)
        (strategies_dir / "tagged.json").write_text(
            json.dumps(
                {
                    "strategy_id": "tagged",
                    "name": "タグ付き戦略",
                    "timeframe": "1h",
                    "tags": ["mean_reversion", "rsi"],
                    "target_symbols": ["TQQQ", "QQQ"],
                }
            ),
            encoding="utf-8",
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)
        response = client.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["tags"] == ["mean_reversion", "rsi"]
        assert data[0]["target_symbols"] == ["TQQQ", "QQQ"]

    def test_list_strategies_defaults_tags_and_target_symbols_to_empty(
        self, client_with_strategies: TestClient
    ) -> None:
        """tags / target_symbols が戦略 JSON にない場合は空配列で返す"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        item = response.json()[0]
        assert item["tags"] == []
        assert item["target_symbols"] == []

    def test_list_strategies_from_db_parses_tags_text_column(
        self, tmp_path: pathlib.Path
    ) -> None:
        """strategies.db の tags TEXT 列（JSON 文字列）を配列として復元する。

        スキーマは ``alpha_visualizer.db.metadata`` を Single Source of Truth として生成。
        """
        db_path = tmp_path / "data" / "strategies" / "strategies.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        schema_engine = create_engine(f"sqlite:///{db_path}", future=True)
        try:
            metadata.create_all(schema_engine, tables=[strategies])
        finally:
            schema_engine.dispose()
        conn = sqlite3.connect(db_path)
        try:
            definition = json.dumps(
                {
                    "strategy_id": "db_tagged",
                    "name": "DB タグ戦略",
                    "target_symbols": ["TQQQ"],
                }
            )
            conn.execute(
                """
                INSERT INTO strategies (
                    strategy_id, name, version, asset_type, timeframe,
                    tags, notes, definition_json,
                    created_at, updated_at
                ) VALUES (
                    'db_tagged', 'DB タグ戦略', '1.0.0', 'stock', '1d',
                    '["momentum","leveraged"]', '', ?, '2026-04-01', '2026-04-01'
                )
                """,
                (definition,),
            )
            conn.commit()
        finally:
            conn.close()

        (tmp_path / "forge.yaml").write_text(
            textwrap.dedent(
                """
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
        app = create_app(config=config)
        client = TestClient(app)

        response = client.get("/api/strategies")
        assert response.status_code == 200
        item = response.json()[0]
        assert item["strategy_id"] == "db_tagged"
        assert item["tags"] == ["momentum", "leveraged"]
        assert item["target_symbols"] == ["TQQQ"]

    def test_get_strategy_not_found(self, client: TestClient) -> None:
        """存在しない strategy_id は 404 を返す"""
        response = client.get("/api/strategies/nonexistent")
        assert response.status_code == 404

    def test_get_strategy_found(self, client_with_strategies: TestClient) -> None:
        """存在する strategy_id は詳細を返す"""
        response = client_with_strategies.get("/api/strategies/test_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["strategy_id"] == "test_strategy"
        assert data["parameters"]["period"] == 20

    def test_get_strategy_found_with_structure(self, tmp_path: pathlib.Path) -> None:
        """戦略構造フィールド（indicators / variables / entry_conditions / exit_conditions /
        risk_management / regime_config）がレスポンスに含まれる"""
        strategies_dir = tmp_path / "data" / "strategies"
        strategies_dir.mkdir(parents=True)
        strategy_def = {
            "strategy_id": "full_strategy",
            "name": "フル戦略",
            "timeframe": "1d",
            "parameters": {"period": 14},
            "indicators": [
                {"id": "rsi", "type": "RSI", "params": {"period": 14}, "lock_on_entry": False}
            ],
            "variables": [{"id": "rsi_val", "expression": "rsi.value"}],
            "entry_conditions": {
                "long": {"type": "AND", "conditions": [{"type": "gt", "left": "rsi_val", "right": 30}]}
            },
            "exit_conditions": {
                "long": {"type": "AND", "conditions": [{"type": "gt", "left": "rsi_val", "right": 70}]}
            },
            "risk_management": {
                "sl_pct": 2.0,
                "tp_pct": 4.0,
                "trailing_stop": False,
                "position_size_pct": 10.0,
                "max_positions": 1,
            },
            "regime_config": {"model": "HMM", "n_states": 2},
        }
        (strategies_dir / "full_strategy.json").write_text(
            json.dumps(strategy_def), encoding="utf-8"
        )
        app = create_app(forge_dir=tmp_path)
        client = TestClient(app)

        response = client.get("/api/strategies/full_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["indicators"] == strategy_def["indicators"]
        assert data["variables"] == strategy_def["variables"]
        assert data["entry_conditions"] == strategy_def["entry_conditions"]
        assert data["exit_conditions"] == strategy_def["exit_conditions"]
        assert data["risk_management"] == strategy_def["risk_management"]
        assert data["regime_config"] == strategy_def["regime_config"]

    def test_get_strategy_structure_missing_fields_returns_defaults(
        self, client_with_strategies: TestClient
    ) -> None:
        """戦略定義に構造フィールドがない場合はデフォルト値（空）を返す"""
        response = client_with_strategies.get("/api/strategies/test_strategy")
        assert response.status_code == 200
        data = response.json()
        assert data["indicators"] == []
        assert data["variables"] == []
        assert data["entry_conditions"] is None
        assert data["exit_conditions"] is None
        assert data["risk_management"] is None
        assert data["regime_config"] is None

    def test_compare_strategies_empty_ids(self, client: TestClient) -> None:
        """ids が空の場合は 400 を返す"""
        response = client.get("/api/strategies/compare?ids=")
        assert response.status_code == 400

    def test_compare_strategies_not_found(self, client: TestClient) -> None:
        """バックテスト結果がない場合は 404 を返す"""
        response = client.get("/api/strategies/compare?ids=nonexistent")
        assert response.status_code == 404


class TestStrategiesRouterJsonFallback:
    def test_json_mode_still_works_without_yaml(
        self, client_with_strategies: TestClient
    ) -> None:
        """forge.yaml が無いとき従来通り JSON glob から戦略を読む"""
        response = client_with_strategies.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["strategy_id"] == "test_strategy"
