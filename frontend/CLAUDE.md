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
| `IdeasPage` | （単独、screen 未分離。将来的には `IdeasScreen` として分離可能） |
