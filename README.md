# alpha-visualizer

[![PyPI version](https://img.shields.io/pypi/v/alpha-visualizer.svg)](https://pypi.org/project/alpha-visualizer/)
[![CI](https://github.com/alforge-labs/alpha-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/alforge-labs/alpha-visualizer/actions/workflows/ci.yml)
[![Python](https://img.shields.io/pypi/pyversions/alpha-visualizer.svg)](https://pypi.org/project/alpha-visualizer/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.en.md) | **日本語**

> **AlphaForge バックテスト結果を Web ブラウザで可視化するスタンドアロンツール**

`alpha-visualizer` は、[AlphaForge](https://alforgelabs.com/) のバックテストエンジンが出力する `forge.db`（SQLite）と戦略 JSON を直接読み取り、ブラウザベースのダッシュボードとして可視化します。`vis serve` 一発で FastAPI + React SPA が起動し、戦略の閲覧・比較・最適化結果の確認・ライブ実績との突き合わせまでを行えます。

![Browse 画面](docs/screenshots/ja/browse.png)

## 主な機能

- **Browse** — 戦略ライブラリの一覧と検索（Symbol Atlas / Saved Views / Strategy Ledger）
- **Detail** — Equity / Drawdown / 取引履歴・ベンチマーク（alpha / beta / IR / Correlation）
- **Compare** — 複数戦略の指標比較と相関ヒートマップ
- **Optimize** — WFO 合成エクイティカーブ・Grid 最適化結果の可視化
- **Live** — バックテストとライブ実績の期間整合 diff
- **Ideas** — 探索アイデアの一覧（ステータス・タグフィルタ）
- **テーマ切替** — ダーク/ライトモード、日英バイリンガル UI
- **エクスポート** — CSV / PNG エクスポート、URL 共有（Browse の selectedId / compareIds 同期）

## クイックスタート

### インストール

```bash
# uv（推奨）
uv pip install alpha-visualizer

# pip
pip install alpha-visualizer
```

### 起動

```bash
# AlphaForge の作業ディレクトリで（forge.db / strategies/ がある場所）
vis serve

# パスを明示する場合
vis serve --forge-dir /path/to/alpha-strategies

# ポート・ホスト指定
vis serve --port 9000 --host 0.0.0.0

# ブラウザを自動で開かない
vis serve --no-open
```

ブラウザで **http://127.0.0.1:8000** が開きます。`Ctrl+C` で停止します。

## スクリーンショット

| Detail | Compare |
|---|---|
| ![Detail](docs/screenshots/ja/detail.png) | ![Compare](docs/screenshots/ja/compare.png) |

| Optimize | Strategy 構造 |
|---|---|
| ![Optimize](docs/screenshots/ja/optimize.png) | ![Strategy](docs/screenshots/ja/strategy.png) |

## ドキュメント

- **公式ドキュメント**: <https://alforgelabs.com/ja/docs/alpha-visualizer/>
- **開発に参加**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **セキュリティ報告**: [SECURITY.md](SECURITY.md)
- **行動規範**: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)（Contributor Covenant v2.1）
- **変更履歴**: [CHANGELOG.md](CHANGELOG.md)
- **サードパーティライセンス**: [THIRDPARTY_LICENSES.txt](THIRDPARTY_LICENSES.txt)

## 関連プロジェクト

- [Alforge Labs](https://alforgelabs.com/) — AlphaForge 公式サイト・チュートリアル
- [AlphaForge](https://alforgelabs.com/ja/docs/) — バックテストエンジン本体（商用ライセンス）

## 開発環境

```bash
# 依存関係インストール
uv sync

# テスト・Lint
uv run pytest tests/ -v
uv run ruff check src/ tests/

# フロントエンド開発サーバー（ホットリロード）
cd frontend && npm install && npm run dev

# フロントエンドビルド（src/alpha_visualizer/static/ に出力）
cd frontend && npm run build
```

詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT License](LICENSE) © [alforge-labs](https://github.com/alforge-labs)
