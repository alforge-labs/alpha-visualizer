<!--
日本語ガイド: https://github.com/alforge-labs/alpha-visualizer/blob/main/CONTRIBUTING.md
English guide: https://github.com/alforge-labs/alpha-visualizer/blob/main/CONTRIBUTING.en.md
-->

## 概要 / Summary

<!--
この PR で何を変更したかを 1〜3 行で説明してください。
Briefly describe what this PR changes (1-3 lines).
-->

## 関連 Issue / Related Issue

<!--
Closes #123 のように記載してください（マージ時に自動で Issue がクローズされます）。
Use `Closes #123` to auto-close the related issue on merge.
-->

Closes #

## 変更内容 / Changes

<!--
- 主な変更点を箇条書きで
- Key changes as bullet points
-->

-

## テスト / Testing

<!--
- [x] 単体テストを追加・更新した / Added or updated unit tests
- [x] CI が緑 / CI is green
-->

- [ ] バックエンドテスト: `uv run pytest tests/ -v`
- [ ] バックエンド Lint: `uv run ruff check src/ tests/`
- [ ] フロントエンドテスト: `cd frontend && pnpm run test:ci`
- [ ] フロントエンド Lint: `cd frontend && pnpm run lint`
- [ ] フロントエンドビルド: `cd frontend && pnpm run build`
- [ ] E2E（UI 変更時）: `cd frontend && pnpm run e2e`
- [ ] スクリーンショット再撮影（UI 変更時）: `cd frontend && pnpm run screenshots`

## スクリーンショット / Screenshots

<!--
UI 変更がある場合、Before / After のスクリーンショットを貼ってください。
For UI changes, paste before/after screenshots.
-->

## チェックリスト / Checklist

- [ ] [CONTRIBUTING.md](../blob/main/CONTRIBUTING.md) を読んだ / Read CONTRIBUTING
- [ ] Conventional Commits 形式でコミットしている / Commits follow Conventional Commits
- [ ] 公開 API / CLI / 設定変更時は alforge-labs ドキュメントも更新 / Public API/CLI/config changes update alforge-labs docs
- [ ] 破壊的変更がある場合 PR 説明欄に明記 / Breaking changes are clearly noted
