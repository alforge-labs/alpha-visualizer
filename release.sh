#!/bin/bash
# alpha-visualizer リリーススクリプト
# 使い方: bash release.sh [patch|minor|major]
# 依存: git-cliff (brew install git-cliff または cargo install git-cliff)
set -euo pipefail

PART=${1:-patch}

if [[ "$PART" != "patch" && "$PART" != "minor" && "$PART" != "major" ]]; then
    echo "使い方: bash release.sh [patch|minor|major]"
    exit 1
fi

if ! command -v git-cliff &>/dev/null; then
    echo "git-cliff が見つかりません。インストールしてください:"
    echo "  brew install git-cliff"
    echo "  または: cargo install git-cliff"
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "コミットされていない変更があります。先にコミットしてください。"
    exit 1
fi

echo "=== バージョンバンプ ($PART) ==="
uv run bump-my-version bump "$PART"

NEW_VERSION=$(grep '^version' pyproject.toml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "新バージョン: v${NEW_VERSION}"

echo "=== CHANGELOG 生成 ==="
git cliff --output CHANGELOG.md
git add CHANGELOG.md
git commit -m "docs: CHANGELOG を v${NEW_VERSION} に更新"

echo "=== リモートへプッシュ ==="
git push && git push --tags

echo "=== v${NEW_VERSION} リリース完了 ==="
echo "GitHub Actions が PyPI パブリッシュを開始します:"
echo "  https://github.com/alforge-labs/alpha-visualizer/actions"
