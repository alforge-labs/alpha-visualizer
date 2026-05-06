# E2E Fixtures

Playwright スモークテスト（`frontend/e2e/specs/`）が利用する最小 forge_dir 構造。

## ディレクトリ構成

```
frontend/e2e/fixtures/forge/
├── forge.yaml                       # 最小 forge 設定（use_db: false）
└── data/
    ├── results/forge.db             # SQLAlchemy で生成された SQLite (~45KB)
    ├── strategies/
    │   ├── sma_cross.json           # 戦略定義 1
    │   ├── rsi_reversal.json        # 戦略定義 2（optimization_runs を持つ）
    │   └── momo_breakout.json       # 戦略定義 3
    └── ideas/ideas.json             # アイデア 1 件
```

## DB の中身

- `backtest_results`: 3 行（戦略ごとに 1 run）。各行 60 営業日の equity_curve / buy_hold_curve、トレード 8 件、metrics_json は full set
- `optimization_runs`: 1 行（rsi_reversal、20 trials）
- `strategies` テーブル: なし（forge.yaml で `use_db: false`、JSON 経路）

## 再生成

`alpha_visualizer.db` のスキーマや E2E が要求するフィールドを変更したら、以下で再生成して差分をコミットする:

```bash
uv run python tests/fixtures/build_e2e_fixture.py
git diff --stat frontend/e2e/fixtures/
```

スクリプトは決定論的（`random.Random(seed)` 固定）で、同じ入力からは毎回同じバイト列を生成する。

## 受け入れ基準

- DB サイズ < 1MB（実測 ~45KB）
- `vis serve --forge-dir frontend/e2e/fixtures/forge --port 8123` で起動して /browse, /detail/sma_cross, /compare?ids=sma_cross,rsi_reversal が表示される
