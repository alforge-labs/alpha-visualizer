# コントリビューションガイド

[English](CONTRIBUTING.en.md) | **日本語**

`alpha-visualizer` への貢献を歓迎します。バグ報告・機能提案・ドキュメント改善・コードのいずれでも構いません。本ガイドは開発フローと品質基準をまとめたものです。

## 目次

- [はじめに（開発環境のセットアップ）](#はじめに開発環境のセットアップ)
- [開発フロー](#開発フロー)
- [コミットメッセージ規約](#コミットメッセージ規約)
- [テストと品質チェック](#テストと品質チェック)
- [Pull Request チェックリスト](#pull-request-チェックリスト)
- [リリースプロセス](#リリースプロセス)
- [質問とサポート](#質問とサポート)

## はじめに（開発環境のセットアップ）

### 必要な環境

- **Python 3.12 以上**
- **[uv](https://docs.astral.sh/uv/)** — Python パッケージマネージャー（必須）
- **Node.js 20 以上 + npm** — フロントエンド開発用
- **Git**

### セットアップ

```bash
# 1. リポジトリを fork して clone
git clone https://github.com/<your-username>/alpha-visualizer.git
cd alpha-visualizer

# 2. Python 依存関係をインストール
uv sync

# 3. フロントエンド依存関係をインストール
cd frontend && npm install && cd ..

# 4. 動作確認（テスト & Lint）
uv run pytest tests/ -v
uv run ruff check src/ tests/
cd frontend && npm run lint && npm run test:ci
```

## 開発フロー

本プロジェクトは **GitHub Flow** に従います。`main` への直接コミットは禁止です。

1. **Issue を確認・作成** — 既存の Issue がなければ作成し、議論で方向性をすり合わせます
2. **ブランチを切る** — `feat/xxx`・`fix/xxx`・`refactor/xxx`・`docs/xxx`・`test/xxx` 等の prefix を使用
3. **テストファースト** — まず失敗するテストを書き、その後最小限の実装でパスさせます
4. **コミット** — 後述の Conventional Commits 規約に従う
5. **Pull Request 作成** — 関連 Issue 番号を `Closes #<番号>` で明記
6. **CI 緑化を確認** — pytest・ruff・vitest・eslint・playwright がすべて通ることを確認
7. **レビュー対応** — 修正を加え、マージ可能になったら squash merge

### ブランチ命名

| プレフィックス | 用途 |
|---|---|
| `feat/` | 新機能の追加 |
| `fix/` | バグ修正 |
| `refactor/` | 振る舞いを変えないリファクタリング |
| `docs/` | ドキュメントのみの変更 |
| `test/` | テストの追加・修正 |
| `chore/` | ビルドや CI など補助的な変更 |

## コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に従い、内容は **日本語で記述** してください（既存のコミット履歴に合わせるため）。

```
<type>: <概要>

<本文（任意・なぜこの変更が必要かを簡潔に）>
```

利用する type:

| type | 用途 |
|---|---|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング |
| `docs` | ドキュメント変更 |
| `test` | テスト追加・修正 |
| `chore` | 補助的な変更 |
| `ci` | CI 関連の変更 |
| `perf` | パフォーマンス改善 |

例:

```
feat: Compare 画面に戦略間相関ヒートマップを追加

複数戦略選択時に Pearson 相関を計算し、
viridis カラースケールで描画する。
```

CHANGELOG は `git-cliff` で `cliff.toml` 設定に基づいて自動生成されるため、type を正確に付けてください。

## テストと品質チェック

すべての PR で CI が通る必要があります。ローカルでも実行できます。

### バックエンド（Python）

```bash
# 単体テスト
uv run pytest tests/ -v

# Lint
uv run ruff check src/ tests/

# Lint 自動修正（適用可能なもののみ）
uv run ruff check --fix src/ tests/
```

### フロントエンド（TypeScript / React）

```bash
cd frontend

# Lint（ESLint）
npm run lint

# 型チェック（tsc --noEmit）
npm run build  # tsc -b + vite build

# 単体テスト（Vitest）
npm run test:ci

# E2E テスト（Playwright）
npm run e2e:install   # 初回のみ
npm run e2e
```

### スクリーンショット再撮影（UI 変更時）

UI に視覚的な変更を加えた場合、`docs/screenshots/{ja,en}/` を再生成してください。

```bash
cd frontend
npm run e2e:install   # 初回のみ
npm run screenshots
git add ../docs/screenshots/
git commit -m "docs: スクリーンショットを再撮影"
```

### 80% カバレッジ目標

新機能・バグ修正には対応するテストを追加してください。バックエンドは `uv run pytest --cov`、フロントエンドは `npm run test:ci -- --coverage` で確認できます。

## Pull Request チェックリスト

PR を提出する前に以下を確認してください。

- [ ] 関連 Issue 番号を `Closes #<番号>` で記載
- [ ] CI（pytest / ruff / vitest / eslint / playwright）がすべて通る
- [ ] 新機能・バグ修正に対応するテストを追加
- [ ] `CHANGELOG.md` への明示的な追記は不要（git-cliff で自動生成）
- [ ] UI 変更がある場合はスクリーンショットを再撮影
- [ ] 公開 API / CLI / 設定を変更した場合は [alforge-labs ドキュメントサイト](https://github.com/alforge-labs/alforge-labs) も同一 PR またはリンク PR で更新
- [ ] 破壊的変更がある場合は PR 説明欄に明記

## リリースプロセス

リリースはメンテナーが行います。手順は [`release.sh`](release.sh) と `.github/workflows/release.yml` を参照してください。

1. `bump-my-version` で `pyproject.toml` のバージョンを更新
2. タグを push（`v0.x.y`）
3. GitHub Actions が PyPI に自動公開

## 質問とサポート

- **バグ報告・機能要望**: [GitHub Issues](https://github.com/alforge-labs/alpha-visualizer/issues)
- **質問・議論**: [GitHub Discussions](https://github.com/alforge-labs/alpha-visualizer/discussions)（有効化されている場合）
- **セキュリティ脆弱性**: 公開 Issue ではなく [SECURITY.md](SECURITY.md) の手順に従って報告してください

ありがとうございます！🎉
