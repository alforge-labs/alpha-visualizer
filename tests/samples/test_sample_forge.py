"""samples/sample-forge を FastAPI TestClient で叩く統合テスト。

`vis serve --use-bundled-samples` で起動した場合に、フロントが要求する各
API エンドポイントが想定通りの件数・形状を返すかを確認する。
"""

from __future__ import annotations

import pathlib

import pytest
from fastapi.testclient import TestClient

from alpha_visualizer.app import create_app
from alpha_visualizer.forge_config import ForgeConfig

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SAMPLE_FORGE_DIR = REPO_ROOT / "samples" / "sample-forge"


@pytest.fixture(scope="module")
def client(monkeypatch_module: pytest.MonkeyPatch) -> TestClient:
    if not SAMPLE_FORGE_DIR.is_dir():
        pytest.skip(
            f"samples/sample-forge not built yet at {SAMPLE_FORGE_DIR}. "
            "Run `uv run python samples/build_samples.py`."
        )
    # 外部の FORGE_CONFIG が指す forge を誤って参照しないよう明示的に上書きする。
    monkeypatch_module.delenv("FORGE_CONFIG", raising=False)
    config = ForgeConfig.from_forge_dir(
        SAMPLE_FORGE_DIR,
        config_path=SAMPLE_FORGE_DIR / "forge.yaml",
    )
    app = create_app(config=config)
    return TestClient(app)


@pytest.fixture(scope="module")
def monkeypatch_module() -> pytest.MonkeyPatch:
    """module スコープの monkeypatch（pytest 標準は function スコープのみ）。"""
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def test_health(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert SAMPLE_FORGE_DIR.name in body["forge_dir"]


def test_results_list_returns_forty_runs(client: TestClient) -> None:
    res = client.get("/api/results")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) == 40
    sample = body[0]
    assert {"run_id", "strategy_id", "symbol", "sharpe_ratio"} <= sample.keys()


def test_result_detail_returns_curves(client: TestClient) -> None:
    res = client.get("/api/results/bt_sma_crossover_v1_EQUITY_SYNTH_001")
    assert res.status_code == 200
    body = res.json()
    assert body["strategy_id"] == "sma_crossover_v1"
    assert body["symbol"] == "EQUITY_SYNTH"
    # equity curve は dict 形式（dates + values）でレスポンスされる
    equity = body.get("equity")
    assert isinstance(equity, dict)
    assert isinstance(equity.get("dates"), list)
    assert len(equity["dates"]) > 1000  # 約 1250 営業日
    assert isinstance(equity.get("values"), list)
    assert len(equity["values"]) == len(equity["dates"])
    assert isinstance(body.get("trades"), list)
    assert len(body["trades"]) >= 10
    assert isinstance(body.get("metrics"), dict)


def test_wfo_endpoint_returns_windows(client: TestClient) -> None:
    res = client.get("/api/wfo/sma_crossover_v1")
    assert res.status_code == 200
    body = res.json()
    assert body["strategy_id"] == "sma_crossover_v1"
    windows = body.get("windows")
    assert isinstance(windows, list)
    assert len(windows) == 6
    first = windows[0]
    assert "is_sharpe" in first or "is_metrics" in first or "params" in first


def test_strategies_list_returns_eight(client: TestClient) -> None:
    res = client.get("/api/strategies")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) == 8
    ids = {s["strategy_id"] for s in body}
    assert "sma_crossover_v1" in ids
    assert "donchian_turtle_v1" in ids


def test_strategy_detail_returns_indicators(client: TestClient) -> None:
    res = client.get("/api/strategies/sma_crossover_v1")
    assert res.status_code == 200
    body = res.json()
    assert body["strategy_id"] == "sma_crossover_v1"
    assert "indicators" in body
    assert len(body["indicators"]) >= 2


def test_ideas_list_returns_five(client: TestClient) -> None:
    res = client.get("/api/ideas")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) == 5
    statuses = {idea.get("status") for idea in body}
    assert statuses & {"tested", "in_progress", "backlog"}


def test_idea_detail_returns_linked_strategies(client: TestClient) -> None:
    res = client.get("/api/ideas/idea_sample_003")
    assert res.status_code == 200
    body = res.json()
    assert body["idea_id"] == "idea_sample_003"
    assert "supertrend_adx_v1" in body.get("linked_strategies", [])


def test_unknown_run_returns_not_found(client: TestClient) -> None:
    res = client.get("/api/results/bt_does_not_exist_001")
    assert res.status_code == 404


def test_unknown_strategy_returns_not_found(client: TestClient) -> None:
    res = client.get("/api/strategies/does_not_exist_v1")
    assert res.status_code == 404
