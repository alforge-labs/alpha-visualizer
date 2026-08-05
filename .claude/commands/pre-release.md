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
   bash release.sh ${PART}
   ```

   `release.sh` は以下を一括で行う:

   1. `bump-my-version bump ${PART}` で `pyproject.toml` / `__init__.py` を更新し、コミット・タグ作成
   2. `uv lock` を流して `uv.lock` 内の自己バージョンを追従させ、差分が出たらタグを
      貼り直して bump コミットに amend（省略すると lock drift が発生する）
   3. `git push && git push --tags`

   タグ push を受けて `.github/workflows/release.yml` が起動し、
   `pnpm install` → `pnpm run build`（フロントエンド静的アセット生成）→ `uv build` →
   `scripts/verify_build_artifacts.py`（アセット同梱検証・issue #225 ガード）→
   PyPI Trusted Publisher の順で公開される。

   **公開は CI に委譲する。ローカルで `uv build` / `uv publish` を実行しないこと。**
   静的アセットは非コミット運用（PR #163）のため、ローカル publish は `pnpm run build` を
   経ずフロントエンド資産を欠いた wheel を公開する危険があり、CI の verify ガードも
   迂回してしまう。

5. **リリース後の告知（GitHub Release + 公式ドキュメント）**

   PyPI 公開を確認したら、以下の 2 つを忘れずに行う（自動化されていない）。

   1. **GitHub Release の作成**: `gh release create v<version>` に CHANGELOG 該当節を
      ベースとした本文を付ける（squash コミットに Conventional 型が無いと CHANGELOG
      から漏れるため、本文は CHANGELOG と実際のマージ PR を突き合わせて書く）。
   2. **alforge-labs ドキュメントのリリースノートページ**: 機能追加を含むリリース
      （minor 以上、または注目度の高い patch）では、`alforge-labs` リポジトリの
      `mkdocs_src/{ja,en}/alpha-visualizer/release-<version>.md` を追加し、
      `mkdocs.ja.yml` / `mkdocs.en.yml` のリリースノート nav に登録して
      `uv run mkdocs build`（ja/en）で成果物を再生成する（既存ページの体裁を踏襲。
      パッチのみのリリースは直近の累積ノートに追記でもよい）。
      docs のリリースノートが止まると、docs だけを見るユーザーには古い版が最新に
      見える（issue alforge-labs/alforge-labs.github.io#444 の再発防止）。

## 注意

- `release.sh` は `git push --tags` まで実行し、その先の PyPI 公開も CI で自動的に始まるため、実行前に必ずユーザーの承認を取ること。
- `bump-my-version` が必要（`uv sync --all-groups` で導入済みのはず）。
- PyPI 公開は Trusted Publisher（`release.yml` の `id-token: write`）で行うため、ローカルの PyPI 認証情報（`UV_PUBLISH_TOKEN` 等）は不要。
- リリース前に `/audit-licenses` を実行して `THIRDPARTY_LICENSES.txt` を最新化すること。
- release.sh を使わず手動で bump する場合も、bump 直後の `uv lock` 追従は省略しないこと。省略すると `uv.lock` 内の自己バージョン文字列が旧バージョンのまま取り残され、リリース後に lock drift が発生する。
