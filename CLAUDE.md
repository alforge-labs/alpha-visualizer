# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# alpha-visualizer — Claude Code ガイド

AI (Claude Code) がこのプロジェクトを素早く理解し、効率よく開発を進めるためのガイドです。

---

## プロジェクト概要

**alpha-visualizer** は、AlphaForge のバックテスト結果を Web ブラウザで可視化するスタンドアロンパッケージです。`vis serve` コマンドで FastAPI + uvicorn サーバーを起動し、`forge.db`（SQLite）を直接読み取ることで alpha-forge への依存なしに動作します。

### 構成

- **Python バックエンド**: FastAPI + uvicorn（`vis serve` コマンド）
- **フロントエンド**: Vite + React + TypeScript（`frontend/` ディレクトリ）
- **データソース**: `forge.db`（SQLite）を SQLAlchemy で直接読み取り（alpha-forge への依存なし）

### 利用方法

```bash
# alpha-forge の作業ディレクトリで実行
vis serve --forge-dir /path/to/alpha-trade/alpha-strategies
```

---

## 開発コマンド

```bash
# 依存関係インストール（初回・更新時）
uv sync

# テスト実行（変更後は必ず実行）
uv run pytest tests/ -v

# Lint（変更後は必ず実行）
uv run ruff check src/ tests/

# サーバー起動（ローカル確認用）
vis serve --forge-dir /path/to/alpha-strategies

# フロントエンドビルド（frontend/ → src/alpha_frontend/static/）
cd frontend && npm install && npm run build

# フロントエンド開発サーバー（バックエンドと同時起動）
cd frontend && npm run dev
```

---

## アーキテクチャ早見表

| モジュール | パス | 役割 |
|----------|------|------|
| CLI | `src/alpha_frontend/cli.py` | Click ベースのエントリーポイント（`vis serve`） |
| アプリファクトリ | `src/alpha_frontend/app.py` | FastAPI アプリ生成・ルーター登録・SPA 配信 |
| DB 定義 | `src/alpha_frontend/db.py` | SQLAlchemy Table 定義（`backtest_results`, `optimization_runs`） |
| パス設定 | `src/alpha_frontend/forge_config.py` | `ForgeConfig` — forge_dir から各データパスを解決 |
| Results ルーター | `src/alpha_frontend/routers/results.py` | `/api/results`, `/api/results/{run_id}` |
| Strategies ルーター | `src/alpha_frontend/routers/strategies.py` | `/api/strategies`, `/api/strategies/compare`, `/api/strategies/{id}` |
| Ideas ルーター | `src/alpha_frontend/routers/ideas.py` | `/api/ideas`（`ideas.json` を直接読み取り） |
| WFO ルーター | `src/alpha_frontend/routers/wfo.py` | `/api/wfo/{strategy_id}` |
| Static | `src/alpha_frontend/static/` | Vite ビルド成果物（`frontend/` で `npm run build` して生成） |
| Frontend | `frontend/` | Vite + React + TS の SPA 本体 |

---

## データの流れ

```
vis serve --forge-dir <dir>
  → ForgeConfig (forge_dir)
    → forge_dir/data/results/forge.db     ← SQLAlchemy で直接読み取り
    → forge_dir/data/strategies/*.json    ← JSON ファイルを直接読み取り
    → forge_dir/data/ideas/ideas.json     ← JSON ファイルを直接読み取り
  → FastAPI ルーター → JSON レスポンス
  → React SPA (src/alpha_frontend/static/)
```

---

## データパス（ForgeConfig）

`ForgeConfig(forge_dir=Path(...))` が提供するプロパティ：

| プロパティ | パス |
|-----------|------|
| `forge_db` | `<forge_dir>/data/results/forge.db` |
| `strategies_dir` | `<forge_dir>/data/strategies/` |
| `ideas_json` | `<forge_dir>/data/ideas/ideas.json` |

---

## 主要 API エンドポイント

| エンドポイント | 内容 |
|--------------|------|
| `GET /api/results` | バックテスト結果一覧（`forge.db` の `backtest_results` テーブル） |
| `GET /api/results/{run_id}` | 特定結果の詳細 |
| `GET /api/strategies` | 戦略 JSON 一覧 |
| `GET /api/strategies/compare` | 複数戦略の比較 |
| `GET /api/strategies/{id}` | 特定戦略の詳細 |
| `GET /api/ideas` | アイデア一覧 |
| `GET /api/wfo/{strategy_id}` | WFO 結果 |
| `GET /health` | ヘルスチェック |

---

## 開発ルール

- **TDD**: 新機能実装前にテストを書く（`tests/` に対応するテストファイルが必要）
- **Python 3.12**: 型アノテーションを積極的に使う
- **alpha-forge 非依存**: `src/alpha_frontend/` 内から `alpha_forge` をインポートしないこと。DB は SQLAlchemy で直接読み取る
- **パッケージ管理**: `pip` ではなく `uv` を使う（`uv add <package>` でパッケージ追加）
- **GitHub Flow（必須）**: `main` ブランチには直接コミット・プッシュしないこと。必ずフィーチャーブランチ（`feat/xxx`, `fix/xxx` 等）を作成し、Pull Request 経由でマージすること
- **ワークツリーの活用**: ごく単純な作業（1ファイルの誤字修正・読み取り専用調査など）を除き、コードを変更する作業はすべてワークツリーを使って隔離された環境で行うこと

---

## フロントエンド開発

`frontend/` は Vite + React + TypeScript で実装された SPA。ビルド成果物は `src/alpha_frontend/static/` に配置する。

```bash
cd frontend

# 依存インストール
npm install

# 開発サーバー（http://localhost:5173）
npm run dev

# 本番ビルド → src/alpha_frontend/static/ に出力
npm run build

# Lint
npm run lint
```

バックエンド API のプロキシ設定は `frontend/vite.config.ts` で定義。

---

## スラッシュコマンド（`.claude/commands/`）

| コマンド | 役割 |
|---------|------|
| `/pre-release` | テスト・Lint 検証からリリース（PyPI 公開）までのフローを実行する |
| `/audit-licenses` | サードパーティライセンスを監査し `THIRDPARTY_LICENSES.txt` を生成する（リリース前に実行） |
