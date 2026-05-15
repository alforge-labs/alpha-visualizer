# alpha-visualizer — Claude Code ガイド

AI (Claude Code / Codex) がこのプロジェクトを素早く理解し、効率よく開発を進めるためのガイドです。

> 親 `alpha-trade/CLAUDE.md` の 9-rule template・プロジェクト固有ガイド・ワークツリー / GitHub Flow / TDD / `uv` 等のルールに従うこと。本ファイルには alpha-visualizer 固有の事項のみ記載する。

---

## プロジェクト概要

**alpha-visualizer** は、AlphaForge のバックテスト結果を Web ブラウザで可視化するスタンドアロンパッケージ。`alpha-vis serve` コマンドで FastAPI + uvicorn サーバーを起動し、`backtest_results.db`（SQLite）を直接読み取ることで alpha-forge への依存なしに動作する。

- **Python バックエンド**: FastAPI + uvicorn（`alpha-vis serve` コマンド）
- **フロントエンド**: Vite + React + TypeScript（`frontend/` ディレクトリ）
- **データソース**: `backtest_results.db`（SQLite）を SQLAlchemy で直接読み取り（alpha-forge への依存なし）

---

## 開発コマンド

```bash
uv sync                                      # 依存関係インストール
uv run pytest tests/ -v                      # テスト（変更後は必須）
uv run ruff check src/ tests/                # Lint
alpha-vis serve --forge-dir /path/to/alpha-strategies   # サーバー起動（ローカル確認）
```

フロントエンドのビルド・開発については後述「フロントエンド開発」を参照。

---

## アーキテクチャ早見表

| モジュール | パス | 役割 |
|----------|------|------|
| CLI | `src/alpha_visualizer/cli.py` | Click ベースのエントリーポイント（`alpha-vis serve`） |
| アプリファクトリ | `src/alpha_visualizer/app.py` | FastAPI アプリ生成・ルーター登録・SPA 配信 |
| DB 定義 | `src/alpha_visualizer/db.py` | SQLAlchemy Table 定義（`backtest_results`, `optimization_runs`） |
| パス設定 | `src/alpha_visualizer/forge_config.py` | `ForgeConfig` — forge_dir から各データパスを解決 |
| Results ルーター | `src/alpha_visualizer/routers/results.py` | `/api/results`, `/api/results/{run_id}` |
| Strategies ルーター | `src/alpha_visualizer/routers/strategies.py` | `/api/strategies`, `/api/strategies/compare`, `/api/strategies/{id}` |
| Ideas ルーター | `src/alpha_visualizer/routers/ideas.py` | `/api/ideas`（`ideas.json` を直接読み取り） |
| WFO ルーター | `src/alpha_visualizer/routers/wfo.py` | `/api/wfo/{strategy_id}` |
| Static | `src/alpha_visualizer/static/` | Vite ビルド成果物（`frontend/` で生成） |
| Frontend | `frontend/` | Vite + React + TS の SPA 本体 |

---

## データの流れ

```
alpha-vis serve --forge-dir <dir>
  → ForgeConfig (forge_dir)
    → forge_dir/data/results/backtest_results.db   ← SQLAlchemy で直接読み取り
    → forge_dir/data/strategies/*.json             ← JSON ファイルを直接読み取り
    → forge_dir/data/ideas/ideas.json              ← JSON ファイルを直接読み取り
  → FastAPI ルーター → JSON レスポンス
  → React SPA (src/alpha_visualizer/static/)
```

`ForgeConfig(forge_dir=Path(...))` が提供するプロパティ：

| プロパティ | パス |
|-----------|------|
| `forge_db` | `<forge_dir>/data/results/backtest_results.db` |
| `strategies_dir` | `<forge_dir>/data/strategies/` |
| `ideas_json` | `<forge_dir>/data/ideas/ideas.json` |

---

## 主要 API エンドポイント

| エンドポイント | 内容 |
|--------------|------|
| `GET /api/results` | バックテスト結果一覧（`backtest_results` テーブル） |
| `GET /api/results/{run_id}` | 特定結果の詳細 |
| `GET /api/strategies` | 戦略 JSON 一覧 |
| `GET /api/strategies/compare` | 複数戦略の比較 |
| `GET /api/strategies/{id}` | 特定戦略の詳細 |
| `GET /api/ideas` | アイデア一覧 |
| `GET /api/wfo/{strategy_id}` | WFO 結果 |
| `GET /health` | ヘルスチェック |

---

## alpha-visualizer 固有ルール

- **alpha-forge 非依存**: `src/alpha_visualizer/` 内から `alpha_forge` をインポートしないこと。DB は SQLAlchemy で直接読み取る
- **OSS ドキュメントの日英同期**: README・CONTRIBUTING・SECURITY は日英両言語（`*.md` / `*.en.md`）で揃えること。一方だけの更新は禁止
- **alforge-labs ドキュメント同期**: 公開 API・CLI オプション・設定（`forge.yaml` 等）に変更を加えた場合、`alforge-labs/mkdocs_src/{ja,en}/alpha-visualizer/` 配下の対応ページも同一 PR またはリンク PR で更新し、`uv run mkdocs build` でビルド成果物を再生成すること

---

## フロントエンド開発

`frontend/` は Vite + React + TypeScript で実装された SPA。ビルド成果物は `src/alpha_visualizer/static/` に配置する。

```bash
cd frontend
pnpm install                   # 依存インストール
pnpm run dev                   # 開発サーバー（http://localhost:5173）
pnpm run build                 # 本番ビルド → src/alpha_visualizer/static/ に出力
pnpm run lint                  # Lint
pnpm run gen                   # OpenAPI スキーマ + TS 型を再生成（schemas/ 変更時に必須）
```

> **静的アセットのビルド運用** (PR #163 以降): Vite ビルド成果物 (`src/alpha_visualizer/static/`) はリポジトリには commit せず、`cd frontend && pnpm run build` で都度生成する運用。リリースワークフロー (`.github/workflows/release.yml`) は wheel build 直前に自動で実行する。開発中に `alpha-vis serve` で SPA を見たい場合は事前にローカルで `pnpm run build` を打つこと（Issue #149）。

### OpenAPI 型自動生成

バックエンドの Pydantic schema が Single Source of Truth。フロント側の TS 型は `openapi-typescript` で `frontend/openapi.json` から自動生成する（[ADR-0003](docs/adr/0003-openapi-typescript-codegen.md)）。

| コマンド | 役割 |
|---------|------|
| `pnpm run gen:openapi` | Python 経由で `frontend/openapi.json` を再生成 |
| `pnpm run gen:types` | `openapi.json` から `src/api/types.gen.ts` を再生成 |
| `pnpm run gen` | 上記 2 つを順番に実行 |

**`src/alpha_visualizer/schemas/*.py` を変更したら必ず `cd frontend && pnpm run gen` を実行**して生成ファイルもコミットする。CI の `openapi-types` ジョブが drift を検出する。

バックエンド API のプロキシ設定は `frontend/vite.config.ts` で定義。

---

## スクリーンショット再撮影

UI に視覚的な変更（レイアウト・色・新コンポーネント追加・i18n 文言の大幅変更）を加えた場合は、`docs/screenshots/{ja,en}/` を再生成する。

```bash
cd frontend
pnpm run e2e:install   # 初回のみ
pnpm run screenshots
git add ../docs/screenshots/
git commit -m "docs: スクリーンショットを再撮影"
```

撮影スクリプトは `frontend/e2e/screenshots/capture.spec.ts`、設定は `frontend/playwright.screenshots.config.ts`。フィクスチャは既存 E2E と共通（`frontend/e2e/fixtures/forge/`）。

---

## スラッシュコマンド（`.claude/commands/`）

| コマンド | 役割 |
|---------|------|
| `/pre-release` | テスト・Lint 検証からリリース（PyPI 公開）までのフローを実行 |
| `/audit-licenses` | サードパーティライセンスを監査し `THIRDPARTY_LICENSES.txt` を生成（リリース前に実行） |
