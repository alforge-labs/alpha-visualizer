# ADR-0003: openapi-typescript による TS 型自動生成と段階的移行

**Status**: Accepted
**Date**: 2026-05-08

## Context

`frontend/src/api/types.ts` (300+ 行) はバックエンド API のレスポンス型を **手書き**で維持していた。バックエンドの Pydantic モデル（PR #98 / #109）と実装の double-source-of-truth になっており、追従漏れによるランタイム型エラーのリスクが残っていた。

PR #109 で詳細系 endpoint まで全 Pydantic 化したため、FastAPI の `app.openapi()` から完全な OpenAPI スキーマが取得可能。これを用いて TS 型を自動生成すれば、バックエンドの型変更が CI で検出できる。

## Decision

`openapi-typescript` を導入し、**バックエンドが Single Source of Truth** とする設計に切り替える。

### ツールチェーン

```
src/alpha_visualizer/schemas/*.py (Pydantic)
        ↓ FastAPI app.openapi()
scripts/generate_openapi.py
        ↓
frontend/openapi.json
        ↓ openapi-typescript
frontend/src/api/types.gen.ts
        ↓ import
frontend/src/api/* (consumer)
```

### 生成コマンド

| コマンド | 役割 |
|---|---|
| `pnpm run gen:openapi` | Python 経由で `frontend/openapi.json` を再生成 |
| `pnpm run gen:types` | `openapi.json` から `types.gen.ts` を再生成 |
| `pnpm run gen` | 上記 2 つを順番に実行 |
| `pnpm run gen:check` | 再生成して git diff、変更があれば fail（CI で利用） |

### CI

CI に `openapi-types` ジョブを追加:
1. uv + pnpm のセットアップ
2. `pnpm run gen` を実行
3. `git diff --exit-code frontend/openapi.json frontend/src/api/types.gen.ts` で commit 漏れを検出
4. Pydantic スキーマが変わっているのに生成ファイルが更新されていなければ CI が落ちる

開発者は **バックエンドの schema を変更したら必ず `cd frontend && pnpm run gen` を実行**し、生成物もコミットに含める運用とする。

## 段階的移行方針

`types.ts` (手書き) と `types.gen.ts` (生成) を**並走**させる:

### Phase 1（本 PR）
- 生成パイプラインの構築
- `types.gen.ts` を生成・コミット
- 既存 `types.ts` は維持（消費側はまだ全て手書き型を参照）
- CI に drift 検出を追加

### Phase 2（将来別 PR）
- `api/client.ts` の関数の戻り値型を `types.gen.ts['components']['schemas']['BacktestDetail']` に切替
- 切替が完了した型は手書きから削除
- ただし、`extra="allow"` で受けている拡張フィールドや、フロント独自の派生型（chart 用に整形した型など）は手書きで残す

### Phase 3（任意）
- すべての API レスポンス型が生成型を直接参照
- `types.ts` は派生型のみを保持

段階的移行とする理由:
- 一気に置換すると既存コードへの影響が広範
- 生成型は `extra="allow"` 由来の柔軟性をフィールドベースで表現しないため、フロント独自の `BacktestDetail` 拡張（例: chart に渡しやすい形にした派生型）は手書きを残すべき
- まず CI で型 drift を検出する仕組みを作り、段階的に消費側を切り替える

## Consequences

### メリット
- バックエンドが Single Source of Truth
- Pydantic schema 変更時に CI で検出
- フロント側の型定義作業が減る
- 開発者が API レスポンスの型を OpenAPI で参照できる

### コスト
- CI に 1 ジョブ増（uv + pnpm セットアップが必要、~2 分）
- 開発者は schema 変更時に `pnpm run gen` を実行する必要あり
- 生成ファイル 2 個（`openapi.json` ~2,000 行 / `types.gen.ts` ~1,500 行）が repo に入る
