---
name: pre-release
description: テスト・Lint 検証から PyPI リリースまでのフローを実行する
command: true
---

# pre-release コマンド

alpha-visualizer のリリース前にテスト・Lint を実行して検証し、問題なければバージョンを上げて PyPI に公開する。

## 使い方

```
/pre-release [patch|minor|major]
```

引数を省略した場合は `patch` として扱う。

## 実行手順

1. **作業ディレクトリの確認**

   alpha-visualizer リポジトリのルートにいること、かつ `main` ブランチにいることを確認する。

   ```bash
   git branch --show-current
   git status
   ```

   未コミットの変更があれば中断してユーザーに確認を求める。

2. **テスト・Lint 検証**

   ```bash
   uv run ruff check src/ tests/
   uv run pytest tests/ -q
   ```

   いずれかが失敗した場合は中断してエラー内容をユーザーに報告する。

3. **バージョン確認**

   現在のバージョンと、バンプ後のバージョンをユーザーに提示して確認を求める。

   ```bash
   grep '^version' pyproject.toml
   ```

   バンプ後のバージョンを計算して提示する（例: `0.1.0` → patch → `0.1.1`）。

4. **リリース実行**

   ユーザーの承認を得てから実行する。

   ```bash
   # バージョンを bump してコミット・タグ
   uv run bump-my-version bump ${PART}

   # uv.lock 内の自己バージョンを追従させ、差分が出たら bump commit に取り込む
   # （bump-my-version は pyproject.toml と __init__.py だけ更新するため、
   #   このステップを省くと uv.lock の自己バージョンが drift する）
   NEW_VERSION=$(grep '^version' pyproject.toml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
   uv lock
   if [[ -n "$(git status --porcelain uv.lock)" ]]; then
       git tag -d "v${NEW_VERSION}"
       git add uv.lock
       git commit --amend --no-edit
       git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"
   fi

   # PyPI に公開
   uv build
   uv publish

   # タグを push
   git push --tags
   git push
   ```

   `release.sh` を使う場合はこれらをまとめて実行できる（`bash release.sh [patch|minor|major]`）。

## 注意

- `git push --tags` と `uv publish` は不可逆な操作のため、実行前に必ずユーザーの承認を取ること。
- `bump-my-version` が必要（`uv sync --all-groups` で導入済みのはず）。
- PyPI 認証情報（`UV_PUBLISH_TOKEN` 等）が設定されていること。
- リリース前に `/audit-licenses` を実行して `THIRDPARTY_LICENSES.txt` を最新化すること。
- bump 直後の `uv lock` ステップは省略しないこと。省略すると `uv.lock` 内の自己バージョン文字列が旧バージョンのまま取り残され、リリース後に lock drift が発生する。
