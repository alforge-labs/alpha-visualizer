## pages/ と screens/ の責務分離

**Container/Presentational Pattern** を採用しています（[ADR-0001](../docs/adr/0001-pages-vs-screens.md)）。

### `frontend/src/pages/<Name>Page.tsx` (Container)

- React Router のエントリポイント
- `useStrategyList` / `useBacktestData` 等の hooks でデータ取得・状態管理
- loading / error の早期 return
- state mutation handler の定義
- render は対応する Screen を呼ぶだけ（または直接 components で十分簡素な場合は許容）

### `frontend/src/screens/<Name>Screen.tsx` (Presentational)

- props で受け取った data + callback のみで render
- `useState` / `useEffect` / fetch hook は呼ばない（受動的）
- Storybook / 単体テストでデータをモック差し替え可能

### 現状の対応関係

| Page | Screens (内部 tab で使い分け) |
|---|---|
| `BrowsePage` | `BrowseScreen` |
| `DetailPage` | `BacktestScreen` / `ISOOSScreen` / `WFOScreen` / `OptimizeScreen` / `StrategyScreen` |
| `ComparePage` | `CompareScreen` |
| `IdeasPage` | `IdeasScreen` |

## charts/visx/ と components/charts/ の責務分離

[ADR-0002](../docs/adr/0002-charts-visx-vs-components.md) で確定。

### `frontend/src/charts/visx/<Name>V.tsx` (Presentational)

- visx primitives のみ
- props で受けた整形済みデータを描画
- 計算・fetch なし、純粋 UI state（viewport 等）のみ許容

### `frontend/src/components/charts/<Name>.tsx` (Container)

- ドメインデータ（`BacktestDetail` 等）を受ける
- 計算は `lib/` の pure function に委譲
- 整形済みデータを `*V` に渡す

### `frontend/src/lib/<calculation>.ts`

- Monte Carlo / 統計 / 数値計算の pure function
- 単体テスト容易、container から呼ぶ

## Storybook

Presentational コンポーネント（`*Screen.tsx` / `*V.tsx` / design primitives）を
ストーリーとして視覚確認するために Storybook 9.x を導入。

```bash
pnpm run storybook       # 開発サーバー（http://localhost:6006）
pnpm run build-storybook # 静的ビルド → frontend/storybook-static/（gitignore 済み）
```

ストーリーの命名規約: `<Component>.stories.tsx` を同じディレクトリに置く。
設定は `.storybook/main.ts` と `.storybook/preview.ts`。preview.ts で
`design/tokens.css` と fontsource を注入し、本アプリと同じ見た目で確認できる。

