# ADR-0001: pages/ と screens/ の責務分離

**Status**: Accepted
**Date**: 2026-05-08

## Context

`frontend/src/pages/` と `frontend/src/screens/` は両ディレクトリが並立しており、新規参画者には責務の違いが伝わりにくい状態だった。実際のコードでは:
- `pages/{Browse,Detail,Compare,Ideas}Page.tsx` が React Router のエントリポイント
- `screens/{Backtest,ISOOS,WFO,Optimize,Strategy,Compare}Screen.tsx` は presentational view（データ取得済みを受けて render）
- ただし `BrowsePage` だけが screens を持たず単独で全 JSX を抱えていた

## Decision

**Container/Presentational Pattern** を採用する。

- **`pages/<Name>Page.tsx`** = Container
  - ルーティングのエントリ
  - hooks 呼び出し（`useStrategyList` 等）でデータ取得・状態管理
  - エラー境界（loading / error の早期 return）
  - state mutation handler の定義
  - render は対応する Screen コンポーネントを呼ぶだけ

- **`screens/<Name>Screen.tsx`** = Presentational
  - props で受け取ったデータと callback のみで render
  - `useState` / `useEffect` / fetch hook を直接呼ばない
  - 純粋な UI（テーマ・アクセシビリティを含む）

## Consequences

**メリット**:
- 1 ファイル 1 責務（SRP）
- Screen は Storybook / 単体テストでデータをモックして検証しやすい
- Container と Presentational の境界がディレクトリで明示される

**コスト**:
- 既存 `BrowsePage` を `BrowsePage` + `BrowseScreen` に分離する作業（本 PR で実施）
- 新規 page 追加時に必ず Screen も書く規律
