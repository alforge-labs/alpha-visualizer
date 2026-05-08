# ADR-0002: charts/visx/ と components/charts/ の責務分離

**Status**: Accepted
**Date**: 2026-05-08

## Context

`frontend/src/charts/visx/` と `frontend/src/components/charts/` の 2 つのチャート系統があり、暗黙のルールが守られていなかった。

実態:
- `charts/visx/*V.tsx` = visx 直接呼び出し、pure SVG primitive（presentational）
- `components/charts/*.tsx` = ドメインデータを受け取り計算・整形してから `*V` を呼ぶ container
- ただし `MonteCarloChart` は計算込み、`MAEMFEScatter` は visx 直 embed で規約から外れていた

## Decision

**Container/Presentational Pattern** を charts にも適用:

- **`charts/visx/<Name>V.tsx`** = Presentational
  - visx primitives のみ使用
  - props で受けたシリアライズ済みデータを描画
  - 自身で計算・fetch・state を持たない（viewport 等の純粋 UI state は許容）
  - `<NameV>` のように `V` suffix で識別

- **`components/charts/<Name>.tsx`** = Container
  - ドメインデータ（`BacktestDetail` 等）を受け取る
  - 計算・整形・データ変換は `lib/` の pure function を呼ぶか、内部で完結
  - 整形済みデータを `<NameV>` に渡す

- **`lib/<calculation>.ts`** = 計算ロジック
  - Monte Carlo / 統計 / 数値計算は pure function として独立
  - container から呼ぶ。テスト容易性が向上

## Consequences

**メリット**:
- 1 ファイル 1 責務（SRP）
- Presentational は Storybook / 単体テストでデータ差し替え可
- 計算ロジックは pure で独立テスト可能

**コスト**:
- 既存 3 チャート（`MonteCarloChart` / `MAEMFEScatter` / `EquityChartV`）の整理が本 PR
- 残り 8 チャート（`CorrelationHeatmap` / `WFOTimeline` / etc.）は将来 issue 化
