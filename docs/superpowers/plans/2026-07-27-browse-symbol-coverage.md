# ブラウズ画面 銘柄カバレッジ表（SP2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウズ画面の銘柄アトラス（カードグリッド）を、銘柄ごとの「未実行レシピ数」を出すソート可能な表に置き換え、「次に何を回すか」に答えられるようにする。

**Architecture:** 集計と並べ替えは `frontend/src/lib/symbolStats.ts` の pure function に置き、表コンポーネント `SymbolCoverageTable` が `useMemo` で包んで描画する。集計単位は戦略ではなくレシピ（SP1 で導入した `(name, 実効銘柄, timeframe)` の畳み込み）に統一する。`SymbolAtlas` / `SymbolCard` / `useSymbolStats` は役目を終えるので削除する。

**Tech Stack:** React 19 + TypeScript / Vite / Vitest + @testing-library/react / Playwright（E2E・スクリーンショット） / pnpm

**設計仕様（SSoT）:** `docs/superpowers/specs/2026-07-27-browse-symbol-coverage-design.md`

## Global Constraints

- 変更はフロントエンド（`frontend/`）のみ。`src/alpha_visualizer/`（Python）と `alpha-forge` には一切手を入れない。
- パッケージマネージャは **pnpm**。`npm` / `yarn` / `bun` を混ぜない。作業ディレクトリは `frontend/`。
- `tsconfig` の `files: []` により **`tsc --noEmit` は 0 ファイルを検査して常に成功する**。型検査の実ゲートは `pnpm run build`（`tsc -b && vite build`）。
- `noUncheckedIndexedAccess: true`。`arr[0]` の型は `T | undefined` になる。`!` や `as` でもみ消さず、`?.` かガードで扱う。
- オブジェクトリテラルで同じキーを二重指定すると `tsc` が **TS2783** を出してビルドが落ちる。`...overrides` を使うテストヘルパーでは、overrides に必須で含まれるキーを既定値側に書かない。
- `pnpm run lint` はパイプに繋がず単独行で実行して終了コードを確認する（パイプすると exit code が化ける）。
- `any` を使わない。exported な関数には引数と戻り値の型を明示する。
- コミットメッセージは Conventional Commits 形式・**日本語**。コード内コメントも日本語。
- 既存コードのスタイルに合わせる。インライン `style` オブジェクト＋CSS 変数（`var(--text3)` 等）が本コードベースの流儀。
- `screens/` 配下は `useState` / `useEffect` / fetch hook を呼べない（ADR-0001）。pure function の呼び出しは可。
- 表示文字列は日英両方を `makeL(lang)('日本語', 'English')` で用意する。

---

## ファイル構成

**新規作成**

| ファイル | 責務 |
|---|---|
| `frontend/src/lib/symbolStats.ts` | `SymbolStat` 型・`buildSymbolStats`・`sortSymbolStats`（すべて pure） |
| `frontend/src/lib/__tests__/symbolStats.test.ts` | 集計・不変条件・並べ替え順のテスト |
| `frontend/src/components/browser/SymbolCoverageTable.tsx` | 表の描画・ソート state・行クリックによる絞り込み |
| `frontend/src/components/browser/__tests__/SymbolCoverageTable.test.tsx` | 表の単体テスト |

**変更**

| ファイル | 内容 |
|---|---|
| `frontend/src/hooks/useStrategyList.ts` | `allRecipes: Recipe[]` を公開し `recipeTotal` をそこから導出 |
| `frontend/src/hooks/__tests__/useStrategyList.test.tsx` | `allRecipes` のテストを追加 |
| `frontend/src/screens/BrowseScreen.tsx` | `SymbolAtlas` → `SymbolCoverageTable`、折り畳みラベル変更 |
| `frontend/e2e/specs/browse.spec.ts` | 見出しの正規表現を新名称に |
| `frontend/e2e/screenshots/capture.spec.ts` | コメント中の旧名称 |
| `frontend/src/components/browser/__tests__/CollapsibleSection.test.tsx` | テスト内のラベル文字列 |

**削除**

| ファイル | 理由 |
|---|---|
| `frontend/src/components/browser/SymbolAtlas.tsx` | 表に置き換わる。参照元は `BrowseScreen` のみ |
| `frontend/src/components/browser/SymbolCard.tsx` | 参照元は `SymbolAtlas` のみ |
| `frontend/src/hooks/useSymbolStats.ts` | 中身を `lib/symbolStats.ts` へ移す。表側が自前で `useMemo` を掛けるためラッパは不要 |

---

## Task 1: `useStrategyList` に `allRecipes` を公開する

フィルタ前の全レシピをカバレッジ表へ渡すための追加。既存の挙動は変えない純粋な追加なので、この時点でビルドもテストも通る。

**Files:**
- Modify: `frontend/src/hooks/useStrategyList.ts`
- Test: `frontend/src/hooks/__tests__/useStrategyList.test.tsx`

**Interfaces:**
- Consumes: `buildRecipes(items: StrategyListItem[]): Recipe[]`（`frontend/src/lib/recipes.ts`。既存・変更しない）
- Produces: `StrategyListState.allRecipes: Recipe[]` — フィルタ・未実行除外・並べ替えのいずれも適用していない全レシピ。Task 3 の `BrowseScreen` がこれを `SymbolCoverageTable` に渡す。

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/__tests__/useStrategyList.test.tsx` の `describe('useStrategyList — レシピ・ロールアップ', ...)` ブロック内、既存の `it('銘柄の選択肢を実効銘柄から作る', ...)` の**直前**に次を追加する。

このブロックには既に `ROLLUP` という fixture と `beforeEach` があり、`ROLLUP` は
「AMD EMA ST（3 variant・うち 2 件実行済み）」と「Idle Recipe（1 variant・未実行）」の
計 2 レシピになる。

```tsx
  it('allRecipes はフィルタに依らず全レシピを返す', async () => {
    // symbol=SPY で絞ると表に出るのは Idle Recipe の 1 件だけになるが、
    // カバレッジ表は「絞り込むためのナビゲーション」なので絞り込み結果に
    // 依存してはならない。依存すると絞り込みを解除する手がかりが消える。
    const { result } = renderWithUrl('/browse?symbol=SPY&include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.allRecipes).toHaveLength(2)
    expect([...result.current.list.allRecipes].map(r => r.name).sort()).toEqual([
      'AMD EMA ST',
      'Idle Recipe',
    ])
  })

  it('recipeTotal は allRecipes の件数と一致する', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipeTotal).toBe(result.current.list.allRecipes.length)
  })
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useStrategyList.test.tsx`
Expected: FAIL。`allRecipes` が `StrategyListState` に存在しないため型エラー、または `undefined.length` で落ちる。

- [ ] **Step 3: `StrategyListState` に `allRecipes` を追加する**

`frontend/src/hooks/useStrategyList.ts` の `StrategyListState` インターフェース、`all: StrategyListItem[]` の直後に追加する。

```ts
  all: StrategyListItem[]
  /**
   * 全戦略から作ったレシピ。絞り込み・未実行除外・並べ替えのいずれも通っていない。
   * 銘柄カバレッジ表のように「絞り込むためのナビゲーション」を描く側が使う。
   */
  allRecipes: Recipe[]
```

- [ ] **Step 4: 実装を差し替える**

同ファイルの `useStrategyList` 本体、現在こうなっている箇所

```ts
  // 分母はフィルタに依らない全体のレシピ数
  const recipeTotal = useMemo(() => buildRecipes(all).length, [all])
```

を次に置き換える。

```ts
  // 分母もカバレッジ表の入力も、フィルタに依らない全体のレシピ
  const allRecipes = useMemo(() => buildRecipes(all), [all])
```

さらに末尾の return 文、現在の

```ts
  return {
    all, recipes, recipeTotal,
```

を次に置き換える。

```ts
  return {
    all, allRecipes, recipes,
    recipeTotal: allRecipes.length,
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useStrategyList.test.tsx`
Expected: PASS（既存ケースも含めて全件）

- [ ] **Step 6: 型ゲートを通す**

Run: `cd frontend && pnpm run build`
Expected: exit 0

- [ ] **Step 7: コミット**

```bash
cd frontend
git add src/hooks/useStrategyList.ts src/hooks/__tests__/useStrategyList.test.tsx
git commit -m "feat(browse): useStrategyList にフィルタ前の全レシピ allRecipes を公開"
```

---

## Task 2: `lib/symbolStats.ts` を作り、旧アトラスを撤去する

銘柄別集計をレシピ単位の pure function として作り直す。同時に、これに依存していた
`SymbolAtlas` / `SymbolCard` / `useSymbolStats` を削除し、`BrowseScreen` から
折り畳みセクションを一旦外す。**このタスク完了時点ではブラウズ画面に銘柄セクションが
無い状態になる**（Task 3 で新しい表を入れる）。ビルドとテストは通る。

**Files:**
- Create: `frontend/src/lib/symbolStats.ts`
- Create: `frontend/src/lib/__tests__/symbolStats.test.ts`
- Delete: `frontend/src/hooks/useSymbolStats.ts`
- Delete: `frontend/src/components/browser/SymbolAtlas.tsx`
- Delete: `frontend/src/components/browser/SymbolCard.tsx`
- Modify: `frontend/src/screens/BrowseScreen.tsx`

**Interfaces:**
- Consumes:
  - `Recipe`（`frontend/src/lib/recipes.ts`）— 主なフィールド: `symbol: string | null`（既に実効銘柄）、`variants: StrategyListItem[]`、`best: StrategyListItem | null`、`runCount: number`。不変条件として `best === null` ⟺ `runCount === 0`。
  - `buildRecipes(items: StrategyListItem[]): Recipe[]`（同上）
  - `classifySymbol(symbol: string | null | undefined): AssetClass`、`type AssetClass`（`frontend/src/lib/assetClass.ts`）
- Produces（Task 3 が使う）:
  - `interface SymbolStat { symbol: string | null; assetClass: AssetClass; recipeCount: number; runRecipeCount: number; unrunRecipeCount: number; bestSharpe: number | null; avgReturnPct: number | null; lastRunAt: string | null }`
  - `type SymbolSortKey = 'symbol' | 'assetClass' | 'recipeCount' | 'runRecipeCount' | 'unrunRecipeCount' | 'bestSharpe' | 'avgReturnPct' | 'lastRunAt'`
  - `type SymbolSortDir = 'asc' | 'desc'`
  - `const DEFAULT_SYMBOL_SORT_KEY: SymbolSortKey`（値は `'unrunRecipeCount'`）
  - `const DEFAULT_SYMBOL_SORT_DIR: SymbolSortDir`（値は `'desc'`）
  - `function buildSymbolStats(recipes: Recipe[]): SymbolStat[]`
  - `function sortSymbolStats(stats: SymbolStat[], key: SymbolSortKey, dir: SymbolSortDir): SymbolStat[]`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/lib/__tests__/symbolStats.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import type { StrategyListItem } from '../../api/types'
import { buildRecipes } from '../recipes'
import {
  buildSymbolStats,
  sortSymbolStats,
  DEFAULT_SYMBOL_SORT_KEY,
  DEFAULT_SYMBOL_SORT_DIR,
  type SymbolStat,
} from '../symbolStats'

/**
 * StrategyListItem のテスト用ファクトリ。
 * strategy_id / name は overrides に必須で含まれるため、既定値側には書かない
 * （二重指定は tsc の TS2783 でビルドエラーになる）。
 */
function mkItem(
  overrides: Partial<StrategyListItem> & { strategy_id: string; name: string },
): StrategyListItem {
  return {
    symbol: null,
    timeframe: '1d',
    tags: [],
    target_symbols: [],
    latest_sharpe: null,
    latest_return_pct: null,
    latest_max_drawdown_pct: null,
    latest_profit_factor: null,
    latest_win_rate_pct: null,
    latest_total_trades: null,
    last_run_at: null,
    latest_source: null,
    ...overrides,
  }
}

function statsOf(items: StrategyListItem[]): SymbolStat[] {
  return buildSymbolStats(buildRecipes(items))
}

/** 目的の銘柄の集計を取り出す。無ければテスト入力の誤りとして落とす。 */
function bySymbol(stats: SymbolStat[], symbol: string | null): SymbolStat {
  const hit = stats.find(s => s.symbol === symbol)
  if (!hit) throw new Error(`銘柄 ${String(symbol)} の集計が無い（テスト入力を確認）`)
  return hit
}

/** SymbolStat のテスト用ファクトリ。並べ替えのテストで使う。 */
function mkStat(overrides: Partial<SymbolStat> & { symbol: string | null }): SymbolStat {
  return {
    assetClass: 'stock',
    recipeCount: 1,
    runRecipeCount: 0,
    unrunRecipeCount: 0,
    bestSharpe: null,
    avgReturnPct: null,
    lastRunAt: null,
    ...overrides,
  }
}

describe('buildSymbolStats — 集計', () => {
  it('レシピを実効銘柄で振り分け、実行済と未実行を数える', () => {
    const stats = statsOf([
      // SPY Trend: 2 variant のうち 1 件実行済み → 実行済レシピ
      mkItem({ strategy_id: 'spy_a1', name: 'SPY Trend', symbol: 'SPY', latest_sharpe: 1.2, last_run_at: '2026-01-02T00:00:00' }),
      mkItem({ strategy_id: 'spy_a2', name: 'SPY Trend', symbol: 'SPY' }),
      // SPY Idle: 未実行レシピ
      mkItem({ strategy_id: 'spy_b1', name: 'SPY Idle', symbol: 'SPY' }),
      // symbol が空で target_symbols にしか銘柄が無い戦略も SPY のバケットに入る
      mkItem({ strategy_id: 'spy_c1', name: 'SPY Defined', target_symbols: ['SPY'] }),
    ])

    const spy = bySymbol(stats, 'SPY')
    expect(spy.recipeCount).toBe(3)
    expect(spy.runRecipeCount).toBe(1)
    expect(spy.unrunRecipeCount).toBe(2)
    // 不変条件 1: 内訳は必ず総数に一致する
    expect(spy.runRecipeCount + spy.unrunRecipeCount).toBe(spy.recipeCount)
    expect(spy.assetClass).toBe('etf')
  })

  it('全銘柄のレシピ数の合計が入力レシピ数と一致する', () => {
    // 不変条件 2: レシピは実効銘柄をちょうど 1 つ持つので、取りこぼしも重複もない
    const items = [
      mkItem({ strategy_id: 'a', name: 'A', symbol: 'SPY', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'b', name: 'B', symbol: 'QQQ' }),
      mkItem({ strategy_id: 'c', name: 'C', symbol: 'QQQ' }),
      mkItem({ strategy_id: 'd', name: 'D' }),
      mkItem({ strategy_id: 'e', name: 'E', target_symbols: ['GC=F'] }),
    ]
    const recipes = buildRecipes(items)
    const stats = buildSymbolStats(recipes)

    expect(stats.reduce((acc, s) => acc + s.recipeCount, 0)).toBe(recipes.length)
    expect(recipes).toHaveLength(5)
  })

  it('一度も実行していない銘柄は指標がすべて null になる', () => {
    // 不変条件 3
    const stats = statsOf([
      mkItem({ strategy_id: 'msft_1', name: 'MSFT Idle', symbol: 'MSFT' }),
      mkItem({ strategy_id: 'msft_2', name: 'MSFT Idle 2', symbol: 'MSFT' }),
    ])

    const msft = bySymbol(stats, 'MSFT')
    expect(msft.recipeCount).toBe(2)
    expect(msft.runRecipeCount).toBe(0)
    expect(msft.unrunRecipeCount).toBe(2)
    expect(msft.bestSharpe).toBeNull()
    expect(msft.avgReturnPct).toBeNull()
    expect(msft.lastRunAt).toBeNull()
  })

  it('成績指標は best 1 件から取り、他の variant を混ぜない', () => {
    // best は Sharpe 最大の v1。v2 は Return が桁違いに大きいが、これを平均に
    // 混ぜると「実在しない戦略の成績」を表示することになる。
    const stats = statsOf([
      mkItem({ strategy_id: 'nvda_v1', name: 'NVDA Trend', symbol: 'NVDA', latest_sharpe: 2.0, latest_return_pct: 5, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'nvda_v2', name: 'NVDA Trend', symbol: 'NVDA', latest_sharpe: 1.0, latest_return_pct: 99, last_run_at: '2026-06-01T00:00:00' }),
    ])

    const nvda = bySymbol(stats, 'NVDA')
    expect(nvda.bestSharpe).toBe(2.0)
    expect(nvda.avgReturnPct).toBe(5)   // 全 variant 平均なら 52 になる
  })

  it('最終実行だけは全 variant の最大を取る', () => {
    // 「この銘柄を最後にいつ触ったか」を答える列なので、best に絞ると
    // 実際より古い日付が出て活動状況を誤って伝える。
    const stats = statsOf([
      mkItem({ strategy_id: 'nvda_v1', name: 'NVDA Trend', symbol: 'NVDA', latest_sharpe: 2.0, latest_return_pct: 5, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'nvda_v2', name: 'NVDA Trend', symbol: 'NVDA', latest_sharpe: 1.0, latest_return_pct: 99, last_run_at: '2026-06-01T00:00:00' }),
    ])

    expect(bySymbol(stats, 'NVDA').lastRunAt).toBe('2026-06-01T00:00:00')
  })

  it('複数レシピの最高 Sharpe は各レシピの best の最大になる', () => {
    const stats = statsOf([
      mkItem({ strategy_id: 'q1', name: 'QQQ A', symbol: 'QQQ', latest_sharpe: 0.8, latest_return_pct: 4, last_run_at: '2026-02-01T00:00:00' }),
      mkItem({ strategy_id: 'q2', name: 'QQQ B', symbol: 'QQQ', latest_sharpe: 1.6, latest_return_pct: 10, last_run_at: '2026-03-01T00:00:00' }),
    ])

    const qqq = bySymbol(stats, 'QQQ')
    expect(qqq.bestSharpe).toBe(1.6)
    expect(qqq.avgReturnPct).toBe(7)   // (4 + 10) / 2
  })

  it('実効銘柄が判明しないレシピは未割当にまとめる', () => {
    const stats = statsOf([
      mkItem({ strategy_id: 'x1', name: 'No Symbol' }),
      mkItem({ strategy_id: 'x2', name: 'No Symbol 2' }),
    ])

    const unassigned = bySymbol(stats, null)
    expect(unassigned.recipeCount).toBe(2)
    expect(unassigned.assetClass).toBe('other')
  })

  it('レシピが空なら空配列を返す', () => {
    expect(buildSymbolStats([])).toEqual([])
  })
})

describe('sortSymbolStats — 並べ替え', () => {
  it('既定は 未実行降順 → レシピ数降順 → 最高Sharpe降順 → 銘柄名昇順', () => {
    // 各段でしか決まらない組み合わせを並べ、4 段すべてが効くことを固定する
    const stats = [
      mkStat({ symbol: 'D', unrunRecipeCount: 1, recipeCount: 2, bestSharpe: 1.0 }),
      mkStat({ symbol: 'C', unrunRecipeCount: 1, recipeCount: 2, bestSharpe: 1.0 }),
      mkStat({ symbol: 'B', unrunRecipeCount: 1, recipeCount: 2, bestSharpe: 2.0 }),
      mkStat({ symbol: 'A', unrunRecipeCount: 1, recipeCount: 5, bestSharpe: 0.1 }),
      mkStat({ symbol: 'Z', unrunRecipeCount: 9, recipeCount: 1, bestSharpe: null }),
    ]

    const sorted = sortSymbolStats(stats, DEFAULT_SYMBOL_SORT_KEY, DEFAULT_SYMBOL_SORT_DIR)
    // Z: 未実行で最前 / A: レシピ数で B より前 / B: Sharpe で C,D より前 / C→D: 銘柄名
    expect(sorted.map(s => s.symbol)).toEqual(['Z', 'A', 'B', 'C', 'D'])
  })

  it('入力配列を破壊しない', () => {
    const stats = [
      mkStat({ symbol: 'A', unrunRecipeCount: 0 }),
      mkStat({ symbol: 'B', unrunRecipeCount: 5 }),
    ]
    sortSymbolStats(stats, DEFAULT_SYMBOL_SORT_KEY, DEFAULT_SYMBOL_SORT_DIR)
    expect(stats.map(s => s.symbol)).toEqual(['A', 'B'])
  })

  it('未割当はどの並べ替えでも末尾に来る', () => {
    const stats = [
      mkStat({ symbol: null, unrunRecipeCount: 99, recipeCount: 99, bestSharpe: 9 }),
      mkStat({ symbol: 'A', unrunRecipeCount: 0, recipeCount: 1, bestSharpe: 0 }),
    ]

    expect(sortSymbolStats(stats, 'unrunRecipeCount', 'desc').map(s => s.symbol)).toEqual(['A', null])
    expect(sortSymbolStats(stats, 'unrunRecipeCount', 'asc').map(s => s.symbol)).toEqual(['A', null])
    expect(sortSymbolStats(stats, 'symbol', 'asc').map(s => s.symbol)).toEqual(['A', null])
    expect(sortSymbolStats(stats, 'bestSharpe', 'desc').map(s => s.symbol)).toEqual(['A', null])
  })

  it('主キーを変えると並びが変わり、dir で反転する', () => {
    const stats = [
      mkStat({ symbol: 'SPY', recipeCount: 3, unrunRecipeCount: 2 }),
      mkStat({ symbol: 'QQQ', recipeCount: 2, unrunRecipeCount: 0 }),
      mkStat({ symbol: 'MSFT', recipeCount: 1, unrunRecipeCount: 1 }),
    ]

    expect(sortSymbolStats(stats, 'recipeCount', 'desc').map(s => s.symbol)).toEqual(['SPY', 'QQQ', 'MSFT'])
    expect(sortSymbolStats(stats, 'recipeCount', 'asc').map(s => s.symbol)).toEqual(['MSFT', 'QQQ', 'SPY'])
  })

  it('区分は表示ラベルではなく ASSET_CLASS_ORDER の順に並ぶ', () => {
    // 指数 → ETF → 個別銘柄 → FX → コモディティ → その他。
    // 文字列比較にすると日英でラベルが変わり、言語によって並びが変わってしまう。
    const stats = [
      mkStat({ symbol: 'CL=F', assetClass: 'commodity', recipeCount: 1, unrunRecipeCount: 0 }),
      mkStat({ symbol: 'SPY', assetClass: 'etf', recipeCount: 1, unrunRecipeCount: 0 }),
      mkStat({ symbol: '^GSPC', assetClass: 'index', recipeCount: 1, unrunRecipeCount: 0 }),
    ]
    expect(sortSymbolStats(stats, 'assetClass', 'asc').map(s => s.assetClass)).toEqual([
      'index',
      'etf',
      'commodity',
    ])
  })

  it('Sharpe が null の銘柄は降順で末尾に沈む', () => {
    const stats = [
      mkStat({ symbol: 'A', bestSharpe: null, recipeCount: 1, unrunRecipeCount: 0 }),
      mkStat({ symbol: 'B', bestSharpe: 0.2, recipeCount: 1, unrunRecipeCount: 0 }),
    ]
    expect(sortSymbolStats(stats, 'bestSharpe', 'desc').map(s => s.symbol)).toEqual(['B', 'A'])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/symbolStats.test.ts`
Expected: FAIL。`../symbolStats` が存在しないため解決できない。

- [ ] **Step 3: `lib/symbolStats.ts` を実装する**

`frontend/src/lib/symbolStats.ts` を新規作成する。

```ts
import type { Recipe } from './recipes'
import { ASSET_CLASS_ORDER, classifySymbol, type AssetClass } from './assetClass'

/**
 * 銘柄ごとのカバレッジ集計。単位は戦略ではなく**レシピ**。
 *
 * 表本体が SP1 でレシピ単位になったため、ここも揃えないと同じ画面で
 * 同じ銘柄が違う数で出る（例: SPY が「87 件」と「51 レシピ」）。
 */
export interface SymbolStat {
  /** 実効銘柄。null = 未割当（定義にも実行結果にも銘柄が無い） */
  symbol: string | null
  assetClass: AssetClass
  /** その銘柄のレシピ数。常に runRecipeCount + unrunRecipeCount と一致する */
  recipeCount: number
  /** 1 件以上の variant がバックテスト済みのレシピ数 */
  runRecipeCount: number
  /** 全 variant が未実行のレシピ数。「次に何を回すか」を答える主指標 */
  unrunRecipeCount: number
  /** 各レシピの best の Sharpe の最大値。実行済みが無ければ null */
  bestSharpe: number | null
  /** 各レシピの best の Return の平均。実行済みが無ければ null */
  avgReturnPct: number | null
  /** 全 variant の最終実行日時の最大値。実行済みが無ければ null */
  lastRunAt: string | null
}

export type SymbolSortKey =
  | 'symbol'
  | 'assetClass'
  | 'recipeCount'
  | 'runRecipeCount'
  | 'unrunRecipeCount'
  | 'bestSharpe'
  | 'avgReturnPct'
  | 'lastRunAt'

export type SymbolSortDir = 'asc' | 'desc'

export const DEFAULT_SYMBOL_SORT_KEY: SymbolSortKey = 'unrunRecipeCount'
export const DEFAULT_SYMBOL_SORT_DIR: SymbolSortDir = 'desc'

/**
 * 並びが決まらないときに順に適用する軸。主キーと重複するものは飛ばす。
 * 方向は主キーの dir に関わらずここで固定する（銘柄名だけ昇順が自然）。
 */
const TIEBREAKS: readonly { key: SymbolSortKey; dir: SymbolSortDir }[] = [
  { key: 'unrunRecipeCount', dir: 'desc' },
  { key: 'recipeCount', dir: 'desc' },
  { key: 'bestSharpe', dir: 'desc' },
  { key: 'symbol', dir: 'asc' },
]

/** 比較用に取り出す値。null は降順で末尾へ沈むよう -Infinity / 空文字にする。 */
function fieldValue(stat: SymbolStat, key: SymbolSortKey): number | string {
  switch (key) {
    case 'symbol':
      return stat.symbol ?? ''
    case 'assetClass':
      // アルファベット順ではなく ASSET_CLASS_ORDER（指数→ETF→個別銘柄→FX→
      // コモディティ→その他）で並べる。表示ラベルは日英で変わるので、
      // 文字列比較にすると言語によって並びが変わってしまう。
      return ASSET_CLASS_ORDER.indexOf(stat.assetClass)
    case 'lastRunAt':
      return stat.lastRunAt ?? ''
    case 'bestSharpe':
      return stat.bestSharpe ?? -Infinity
    case 'avgReturnPct':
      return stat.avgReturnPct ?? -Infinity
    case 'recipeCount':
      return stat.recipeCount
    case 'runRecipeCount':
      return stat.runRecipeCount
    case 'unrunRecipeCount':
      return stat.unrunRecipeCount
  }
}

function compareBy(a: SymbolStat, b: SymbolStat, key: SymbolSortKey, dir: SymbolSortDir): number {
  const va = fieldValue(a, key)
  const vb = fieldValue(b, key)
  let cmp: number
  if (typeof va === 'string' && typeof vb === 'string') {
    cmp = va.localeCompare(vb)
  } else if (typeof va === 'number' && typeof vb === 'number') {
    cmp = va < vb ? -1 : va > vb ? 1 : 0
  } else {
    cmp = 0
  }
  return dir === 'asc' ? cmp : -cmp
}

/**
 * 銘柄別集計を並べ替える。入力は破壊しない。
 *
 * 未割当はどの並べ替えでも末尾に固定する。銘柄が不明な行は「次に回す候補」にも
 * 「成績の比較対象」にもならないため、並べ替えの対象から外す。
 */
export function sortSymbolStats(
  stats: SymbolStat[],
  key: SymbolSortKey,
  dir: SymbolSortDir,
): SymbolStat[] {
  return [...stats].sort((a, b) => {
    if (a.symbol === null && b.symbol !== null) return 1
    if (b.symbol === null && a.symbol !== null) return -1

    const primary = compareBy(a, b, key, dir)
    if (primary !== 0) return primary

    for (const tiebreak of TIEBREAKS) {
      if (tiebreak.key === key) continue
      const cmp = compareBy(a, b, tiebreak.key, tiebreak.dir)
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

/** 1 銘柄分の集計を作る。 */
function buildStat(symbol: string | null, group: Recipe[]): SymbolStat {
  let bestSharpe: number | null = null
  let returnSum = 0
  let returnCount = 0
  let lastRunAt: string | null = null
  let runRecipeCount = 0

  for (const recipe of group) {
    if (recipe.runCount > 0) runRecipeCount += 1

    // 成績指標は best 1 件から。レシピごとに別 variant の最良値を混ぜると、
    // 実在しない戦略の成績を合成表示することになる。
    const best = recipe.best
    if (best != null) {
      if (best.latest_sharpe != null) {
        bestSharpe = bestSharpe == null ? best.latest_sharpe : Math.max(bestSharpe, best.latest_sharpe)
      }
      if (best.latest_return_pct != null) {
        returnSum += best.latest_return_pct
        returnCount += 1
      }
    }

    // 最終実行は「この銘柄を最後にいつ触ったか」なので全 variant から取る。
    // best に絞ると実際より古い日付が出て活動状況を誤って伝える。
    for (const variant of recipe.variants) {
      const runAt = variant.last_run_at
      if (runAt && (lastRunAt == null || runAt > lastRunAt)) lastRunAt = runAt
    }
  }

  return {
    symbol,
    assetClass: symbol == null ? 'other' : classifySymbol(symbol),
    recipeCount: group.length,
    runRecipeCount,
    unrunRecipeCount: group.length - runRecipeCount,
    bestSharpe,
    avgReturnPct: returnCount > 0 ? returnSum / returnCount : null,
    lastRunAt,
  }
}

/**
 * レシピ一覧を銘柄別に集計する。返り値の順序は入力の初出順（未割当のみ末尾）。
 * 並べ替えは `sortSymbolStats` の責務。
 */
export function buildSymbolStats(recipes: Recipe[]): SymbolStat[] {
  const buckets = new Map<string, Recipe[]>()
  const unassigned: Recipe[] = []

  for (const recipe of recipes) {
    // recipe.symbol は buildRecipes が effectiveSymbol で決めた実効銘柄。
    // ここで再度 item.symbol を見てはならない（定義側にしか銘柄が無い戦略が漏れる）。
    const symbol = recipe.symbol
    if (symbol == null) {
      unassigned.push(recipe)
      continue
    }
    const arr = buckets.get(symbol)
    if (arr) arr.push(recipe)
    else buckets.set(symbol, [recipe])
  }

  const out: SymbolStat[] = []
  for (const [symbol, group] of buckets.entries()) out.push(buildStat(symbol, group))
  if (unassigned.length > 0) out.push(buildStat(null, unassigned))
  return out
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/symbolStats.test.ts`
Expected: PASS（全 13 ケース）

- [ ] **Step 5: 判別力を確認する（ablation・3 回）**

各退行を入れてテストを走らせ、**期待どおりのテストが落ちること**を確認したうえで元に戻す。落ちなかった場合はテストが弱いので、退行を検出できるようテストを強化してから先へ進む。

1. `buildStat` の `if (recipe.runCount > 0) runRecipeCount += 1` を
   `if (recipe.variantCount > 0) runRecipeCount += 1` に変える
   → 「実行済と未実行を数える」「一度も実行していない銘柄」が落ちること
2. `buildStat` の成績指標の集計を、`recipe.best` ではなく `recipe.variants` の全件で回すよう変える
   （`for (const v of recipe.variants) { ...latest_sharpe / latest_return_pct を集計... }`）
   → 「成績指標は best 1 件から取り、他の variant を混ぜない」が落ちること。
   **`variants[0]` への差し替えは使わない**（`variants` は Sharpe 降順なので
   `best === variants[0]` となり判別できない）
3. `DEFAULT_SYMBOL_SORT_KEY` を `'recipeCount'` に変える
   → 「既定は 未実行降順 → …」が落ちること

- [ ] **Step 6: 旧アトラスを削除し、`BrowseScreen` から外す**

```bash
cd frontend
git rm src/hooks/useSymbolStats.ts src/components/browser/SymbolAtlas.tsx src/components/browser/SymbolCard.tsx
```

`frontend/src/screens/BrowseScreen.tsx` から次の import 行を削除する。

```tsx
import { SymbolAtlas } from '../components/browser/SymbolAtlas'
import { CollapsibleSection } from '../components/browser/CollapsibleSection'
```

同ファイルの次のブロックを丸ごと削除する（Task 3 で新しい表を入れ直す）。

```tsx
      {!list.loading && list.all.length > 0 && (
        <CollapsibleSection
          label={L(
            `銘柄アトラス（${list.symbols.length} 銘柄）`,
            `Symbol atlas (${list.symbols.length} symbols)`,
          )}
          testId="symbol-atlas-collapsible"
        >
          <SymbolAtlas items={list.all} lang={lang} />
        </CollapsibleSection>
      )}
```

- [ ] **Step 7: 参照が残っていないことを確認する**

Run: `cd frontend && grep -rn "SymbolAtlas\|SymbolCard\|useSymbolStats" src e2e --include='*.ts' --include='*.tsx'`
Expected: 出力なし（exit 1）

- [ ] **Step 8: 全テストとビルドを通す**

以下を1行ずつ別々に実行する（パイプに繋がない）。

Run: `cd frontend && pnpm vitest run`
Expected: 全件 PASS

Run: `cd frontend && pnpm run lint`
Expected: exit 0

Run: `cd frontend && pnpm run build`
Expected: exit 0

> `e2e/specs/browse.spec.ts` の「銘柄アトラスは既定で畳まれている」は、この時点では
> セクションごと消えているため失敗する。Task 3・Task 4 で直すので、ここでは E2E を回さない。

- [ ] **Step 9: コミット**

```bash
cd frontend
git add -A src/lib/symbolStats.ts src/lib/__tests__/symbolStats.test.ts src/screens/BrowseScreen.tsx src/hooks/useSymbolStats.ts src/components/browser/SymbolAtlas.tsx src/components/browser/SymbolCard.tsx
git commit -m "refactor(browse): 銘柄集計をレシピ単位の pure function へ移し、旧銘柄アトラスを削除"
```

---

## Task 3: `SymbolCoverageTable` を作ってブラウズ画面に組み込む

**Files:**
- Create: `frontend/src/components/browser/SymbolCoverageTable.tsx`
- Create: `frontend/src/components/browser/__tests__/SymbolCoverageTable.test.tsx`
- Modify: `frontend/src/screens/BrowseScreen.tsx`

**Interfaces:**
- Consumes:
  - `SymbolStat` / `SymbolSortKey` / `SymbolSortDir` / `DEFAULT_SYMBOL_SORT_KEY` / `DEFAULT_SYMBOL_SORT_DIR` / `buildSymbolStats` / `sortSymbolStats`（`frontend/src/lib/symbolStats.ts`。Task 2 で作成）
  - `StrategyListState.allRecipes: Recipe[]`（Task 1 で公開）
  - `TD_BASE: CSSProperties` と `sharpeTone(v: number | null | undefined): string`（`frontend/src/components/browser/StrategyRow.tsx` が既に export 済み。`StrategyTable.tsx` も同じものを import している）
  - `SortHeaderCell`（`frontend/src/design/primitives/SortHeaderCell.tsx`）— props: `label: string` / `active: boolean` / `direction: 'asc' | 'desc'` / `onSort: () => void` / `align?: 'left' | 'right' | 'center'` / `width?: number | string` / `className?: string` / `baseStyle?: CSSProperties`。内部で `<th scope="col" aria-sort>` と実 `<button>` を描く
  - `ASSET_CLASS_LABEL: Record<AssetClass, { ja: string; en: string }>`（`frontend/src/lib/assetClass.ts`）
  - `fmtNumber(value, { decimals?, suffix? })` / `fmtDate(value)`（`frontend/src/lib/format.ts`。null は `'—'`）
  - `CollapsibleSection`（`frontend/src/components/browser/CollapsibleSection.tsx`）— props: `label: string` / `defaultOpen?: boolean` / `children` / `testId?: string`
- Produces: `function SymbolCoverageTable(props: { recipes: Recipe[]; lang: Lang }): React.ReactElement | null`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/browser/__tests__/SymbolCoverageTable.test.tsx` を新規作成する。

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { buildRecipes } from '../../../lib/recipes'
import { SymbolCoverageTable } from '../SymbolCoverageTable'

function mkItem(
  overrides: Partial<StrategyListItem> & { strategy_id: string; name: string },
): StrategyListItem {
  return {
    symbol: null,
    timeframe: '1d',
    tags: [],
    target_symbols: [],
    latest_sharpe: null,
    latest_return_pct: null,
    latest_max_drawdown_pct: null,
    latest_profit_factor: null,
    latest_win_rate_pct: null,
    latest_total_trades: null,
    last_run_at: null,
    latest_source: null,
    ...overrides,
  }
}

/**
 * SPY: 3 レシピ（実行済 1 / 未実行 2）
 * QQQ: 2 レシピ（実行済 2 / 未実行 0）
 * MSFT: 1 レシピ（未実行のみ）
 * 未割当: 1 レシピ
 */
const ITEMS: StrategyListItem[] = [
  mkItem({ strategy_id: 'spy1', name: 'SPY Trend', symbol: 'SPY', latest_sharpe: 1.4, latest_return_pct: 12, last_run_at: '2026-03-01T00:00:00' }),
  mkItem({ strategy_id: 'spy2', name: 'SPY Idle A', symbol: 'SPY' }),
  mkItem({ strategy_id: 'spy3', name: 'SPY Idle B', symbol: 'SPY' }),
  mkItem({ strategy_id: 'qqq1', name: 'QQQ A', symbol: 'QQQ', latest_sharpe: 0.8, latest_return_pct: 4, last_run_at: '2026-02-01T00:00:00' }),
  mkItem({ strategy_id: 'qqq2', name: 'QQQ B', symbol: 'QQQ', latest_sharpe: 0.5, latest_return_pct: 2, last_run_at: '2026-01-01T00:00:00' }),
  mkItem({ strategy_id: 'msft1', name: 'MSFT Idle', symbol: 'MSFT' }),
  mkItem({ strategy_id: 'none1', name: 'No Symbol' }),
]

/** URL の変化を assert するための覗き窓。 */
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="search">{location.search}</div>
}

function renderTable(items: StrategyListItem[] = ITEMS, initialUrl = '/browse') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <SymbolCoverageTable recipes={buildRecipes(items)} lang="ja" />
      <LocationProbe />
    </MemoryRouter>,
  )
}

/** tbody の各行の銘柄セルの表示文字列。ヘッダ行は除く。 */
function rowSymbols(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('cell')[0]?.textContent?.trim() ?? '')
}

/** 指定した銘柄の行のセル文字列一覧。 */
function cellsOf(symbol: string): string[] {
  const row = screen.getByRole('button', { name: symbol }).closest('tr')
  if (!row) throw new Error(`${symbol} の行が見つからない`)
  return within(row).getAllByRole('cell').map(c => c.textContent?.trim() ?? '')
}

describe('<SymbolCoverageTable />', () => {
  it('既定では未実行の多い銘柄が先頭に出て、未割当は末尾に来る', () => {
    renderTable()
    // SPY(未実行2) → MSFT(1) → QQQ(0)、未割当は未実行1でも末尾固定
    expect(rowSymbols()).toEqual(['SPY', 'MSFT', 'QQQ', '未割当'])
  })

  it('一度も実行していない銘柄は実行済 0・未実行がレシピ数と等しい', () => {
    renderTable()
    // 列: 銘柄 / 区分 / レシピ / 実行済 / 未実行 / 最高Sharpe / 平均Return / 最終実行
    const cells = cellsOf('MSFT')
    expect(cells[2]).toBe('1')   // レシピ
    expect(cells[3]).toBe('0')   // 実行済
    expect(cells[4]).toBe('1')   // 未実行
    expect(cells[5]).toBe('—')   // 最高 Sharpe
  })

  it('実行済と未実行が混在する銘柄の内訳を出す', () => {
    renderTable()
    const cells = cellsOf('SPY')
    expect(cells[2]).toBe('3')
    expect(cells[3]).toBe('1')
    expect(cells[4]).toBe('2')
  })

  it('列ヘッダのクリックでソート軸が変わり、再クリックで方向が反転する', async () => {
    renderTable()
    const recipeHeader = screen.getByRole('button', { name: /^レシピ/ })

    await userEvent.click(recipeHeader)
    expect(rowSymbols()).toEqual(['SPY', 'QQQ', 'MSFT', '未割当'])

    await userEvent.click(recipeHeader)
    expect(rowSymbols()).toEqual(['MSFT', 'QQQ', 'SPY', '未割当'])
  })

  it('銘柄ボタンのクリックで絞り込みが付き、もう一度で外れる', async () => {
    renderTable()
    const spy = screen.getByRole('button', { name: 'SPY' })

    await userEvent.click(spy)
    expect(screen.getByTestId('search').textContent).toBe('?symbol=SPY')

    await userEvent.click(spy)
    expect(screen.getByTestId('search').textContent).toBe('')
  })

  it('行のクリックでも 1 回だけトグルする（ボタンと二重発火しない）', async () => {
    renderTable()
    const row = screen.getByRole('button', { name: 'SPY' }).closest('tr')
    if (!row) throw new Error('SPY の行が見つからない')

    await userEvent.click(row)
    expect(screen.getByTestId('search').textContent).toBe('?symbol=SPY')
  })

  it('既に絞り込まれている銘柄の行は aria-pressed が true になる', () => {
    renderTable(ITEMS, '/browse?symbol=QQQ')
    expect(screen.getByRole('button', { name: 'QQQ' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'SPY' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('未割当の行は絞り込めない', () => {
    renderTable()
    expect(screen.getByRole('button', { name: '未割当' })).toBeDisabled()
  })

  it('768px 以下で落とす列にだけ u-col-hide-md-down が付く', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader')
    const classOf = (re: RegExp): string =>
      headers.find(h => re.test(h.textContent ?? ''))?.className ?? '__not_found__'

    expect(classOf(/区分/)).toContain('u-col-hide-md-down')
    expect(classOf(/平均 Return/)).toContain('u-col-hide-md-down')
    expect(classOf(/最終実行/)).toContain('u-col-hide-md-down')
    // 未実行は本 SP2 の主目的なのでどの幅でも落とさない
    expect(classOf(/未実行/)).not.toContain('u-col-hide-md-down')
    expect(classOf(/^銘柄/)).not.toContain('u-col-hide-md-down')
  })

  it('レシピが無いときは何も描かない', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/browse']}>
        <SymbolCoverageTable recipes={[]} lang="ja" />
      </MemoryRouter>,
    )
    expect(container.querySelector('table')).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/SymbolCoverageTable.test.tsx`
Expected: FAIL。`../SymbolCoverageTable` が存在しないため解決できない。

- [ ] **Step 3: `SymbolCoverageTable` を実装する**

`frontend/src/components/browser/SymbolCoverageTable.tsx` を新規作成する。

```tsx
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Recipe } from '../../lib/recipes'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { ASSET_CLASS_LABEL } from '../../lib/assetClass'
import { fmtNumber, fmtDate } from '../../lib/format'
import { SortHeaderCell } from '../../design/primitives/SortHeaderCell'
import { TD_BASE, sharpeTone } from './StrategyRow'
import {
  buildSymbolStats,
  sortSymbolStats,
  DEFAULT_SYMBOL_SORT_KEY,
  DEFAULT_SYMBOL_SORT_DIR,
  type SymbolStat,
  type SymbolSortKey,
  type SymbolSortDir,
} from '../../lib/symbolStats'

interface Props {
  /**
   * フィルタ前の全レシピ。絞り込むためのナビゲーションなので、
   * 絞り込み結果に応じて増減させてはならない。
   */
  recipes: Recipe[]
  lang: Lang
}

const TH_BASE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  padding: '10px 12px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

interface Column {
  key: SymbolSortKey
  ja: string
  en: string
  align: 'left' | 'right'
  /** 768px 以下で隠す列。未実行は本 SP2 の主目的なので対象にしない */
  hideMdDown?: boolean
}

const COLUMNS: readonly Column[] = [
  { key: 'symbol', ja: '銘柄', en: 'Symbol', align: 'left' },
  { key: 'assetClass', ja: '区分', en: 'Class', align: 'left', hideMdDown: true },
  { key: 'recipeCount', ja: 'レシピ', en: 'Recipes', align: 'right' },
  { key: 'runRecipeCount', ja: '実行済', en: 'Run', align: 'right' },
  { key: 'unrunRecipeCount', ja: '未実行', en: 'Unrun', align: 'right' },
  { key: 'bestSharpe', ja: '最高 Sharpe', en: 'Best Sharpe', align: 'right' },
  { key: 'avgReturnPct', ja: '平均 Return', en: 'Avg return', align: 'right', hideMdDown: true },
  { key: 'lastRunAt', ja: '最終実行', en: 'Last run', align: 'right', hideMdDown: true },
]

function returnTone(v: number | null): string {
  if (v == null) return 'var(--text3)'
  return v >= 0 ? 'var(--success)' : 'var(--danger)'
}

interface RowProps {
  stat: SymbolStat
  selected: boolean
  dimmed: boolean
  onToggle: (symbol: string) => void
  lang: Lang
}

function SymbolCoverageRow({ stat, selected, dimmed, onToggle, lang }: RowProps): React.ReactElement {
  const L = makeL(lang)
  const symbol = stat.symbol
  const label = symbol == null ? L('未割当', 'Unassigned') : symbol

  const handleToggle = (): void => {
    if (symbol == null) return
    onToggle(symbol)
  }

  return (
    <tr
      onClick={handleToggle}
      style={{
        background: selected ? 'var(--accent-bg)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        opacity: dimmed ? 0.55 : 1,
        cursor: symbol == null ? 'default' : 'pointer',
        transition: 'background var(--motion-fast)',
      }}
    >
      <td style={{ ...TD_BASE, textAlign: 'left' }}>
        <button
          type="button"
          aria-pressed={selected}
          disabled={symbol == null}
          // 行の onClick と二重発火するとトグルが打ち消し合うため伝播を止める
          onClick={(e) => { e.stopPropagation(); handleToggle() }}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            fontFamily: 'var(--serif)',
            fontSize: '1.0625rem',
            fontWeight: 600,
            color: symbol == null ? 'var(--text3)' : 'var(--text)',
            letterSpacing: '-0.005em',
            cursor: symbol == null ? 'default' : 'pointer',
          }}
        >
          {label}
        </button>
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, textAlign: 'left', color: 'var(--text3)' }}>
        {symbol == null ? '—' : ASSET_CLASS_LABEL[stat.assetClass][lang]}
      </td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{stat.recipeCount}</td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{stat.runRecipeCount}</td>
      <td
        style={{
          ...TD_BASE,
          color: stat.unrunRecipeCount > 0 ? 'var(--warn)' : 'var(--text3)',
          fontWeight: 700,
        }}
      >
        {stat.unrunRecipeCount}
      </td>
      <td style={{ ...TD_BASE, color: sharpeTone(stat.bestSharpe), fontWeight: 700 }}>
        {fmtNumber(stat.bestSharpe, { decimals: 2 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: returnTone(stat.avgReturnPct) }}>
        {fmtNumber(stat.avgReturnPct, { suffix: '%', decimals: 1 })}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, color: 'var(--text3)', fontSize: 'var(--fs-mono-sm)' }}
      >
        {fmtDate(stat.lastRunAt)}
      </td>
    </tr>
  )
}

/**
 * 銘柄カバレッジ表。
 *
 * 「どの銘柄に未実行レシピが溜まっているか」＝次に何を回すかに答える。
 * 並べ替えの state は URL に載せない。SavedViews が URL パラメータを保存する
 * 仕組みのため、載せると保存ビューに並び順まで混入する。
 */
export function SymbolCoverageTable({ recipes, lang }: Props): React.ReactElement | null {
  const L = makeL(lang)
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortKey, setSortKey] = useState<SymbolSortKey>(DEFAULT_SYMBOL_SORT_KEY)
  const [sortDir, setSortDir] = useState<SymbolSortDir>(DEFAULT_SYMBOL_SORT_DIR)

  const stats = useMemo(() => buildSymbolStats(recipes), [recipes])
  const sorted = useMemo(() => sortSymbolStats(stats, sortKey, sortDir), [stats, sortKey, sortDir])

  const symbolFilter = useMemo(
    () => (searchParams.get('symbol') ?? '').split(',').filter(Boolean),
    [searchParams],
  )

  const toggleSymbol = (symbol: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const current = next.get('symbol')?.split(',').filter(Boolean) ?? []
      const updated = current.includes(symbol)
        ? current.filter(v => v !== symbol)
        : [...current, symbol]
      if (updated.length) next.set('symbol', updated.join(','))
      else next.delete('symbol')
      return next
    }, { replace: true })
  }

  const handleSort = (key: SymbolSortKey): void => {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
  }

  if (sorted.length === 0) return null

  return (
    <section
      aria-label={L('銘柄カバレッジ', 'Symbol coverage')}
      style={{
        padding: 'var(--space-4) var(--space-7)',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--serif)',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.005em',
          }}
        >
          {L('銘柄カバレッジ', 'Symbol coverage')}
        </h2>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
            textTransform: 'uppercase',
          }}
        >
          {L(
            `${sorted.length}銘柄 · ${recipes.length}レシピ`,
            `${sorted.length} symbols · ${recipes.length} recipes`,
          )}
        </span>
      </div>

      <div className="u-scroll-x" data-testid="symbol-coverage-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <SortHeaderCell
                  key={col.key}
                  label={L(col.ja, col.en)}
                  active={sortKey === col.key}
                  direction={sortDir}
                  onSort={() => handleSort(col.key)}
                  align={col.align}
                  className={col.hideMdDown ? 'u-col-hide-md-down' : undefined}
                  baseStyle={{
                    ...TH_BASE,
                    color: sortKey === col.key ? 'var(--text2)' : 'var(--text3)',
                  }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(stat => {
              const selected = stat.symbol != null && symbolFilter.includes(stat.symbol)
              return (
                <SymbolCoverageRow
                  key={stat.symbol ?? '__unassigned__'}
                  stat={stat}
                  selected={selected}
                  dimmed={symbolFilter.length > 0 && !selected}
                  onToggle={toggleSymbol}
                  lang={lang}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/SymbolCoverageTable.test.tsx`
Expected: PASS（全 10 ケース）

- [ ] **Step 5: `BrowseScreen` に組み込む**

`frontend/src/screens/BrowseScreen.tsx` に import を追加する（`SettingsToggles` の import の直前あたり、既存の import 群と同じ並びで）。

```tsx
import { SymbolCoverageTable } from '../components/browser/SymbolCoverageTable'
import { CollapsibleSection } from '../components/browser/CollapsibleSection'
import { buildSymbolStats } from '../lib/symbolStats'
```

`BrowseScreen` 関数の先頭、`const L = makeL(lang)` の直後に折り畳みラベル用の集計を置く。
`screens/` は hook を呼べないが、`buildSymbolStats` は pure function なので呼んでよい。

```tsx
  const L = makeL(lang)
  // 折り畳みラベルの件数は表の行数と一致させる（list.symbols は未割当を含まないので 1 ずれる）
  const coverage = buildSymbolStats(list.allRecipes)
  const unrunRecipeTotal = coverage.reduce((acc, s) => acc + s.unrunRecipeCount, 0)
```

Task 2 で削除したブロックがあった位置（`<GroupByToggle>` を含む `div` の直後、
`<div style={{ display: 'flex', flex: 1 }}>` の直前）に次を入れる。

```tsx
      {!list.loading && list.all.length > 0 && (
        <CollapsibleSection
          label={L(
            `銘柄カバレッジ（${coverage.length} 銘柄 · 未実行 ${unrunRecipeTotal} レシピ）`,
            `Symbol coverage (${coverage.length} symbols · ${unrunRecipeTotal} unrun recipes)`,
          )}
          testId="symbol-coverage-collapsible"
        >
          <SymbolCoverageTable recipes={list.allRecipes} lang={lang} />
        </CollapsibleSection>
      )}
```

- [ ] **Step 6: 判別力を確認する（ablation・2 回）**

各退行を入れてテストを走らせ、**期待どおりのテストが落ちること**を確認したうえで元に戻す。

1. 銘柄セルの `<button>` から `e.stopPropagation()` を外す
   → 「行のクリックでも 1 回だけトグルする」が落ちること（ボタンクリック側の
   テストも二重トグルで落ちる可能性がある。どちらでも判別できていればよい）
2. `COLUMNS` の `unrunRecipeCount` に `hideMdDown: true` を付ける
   → 「768px 以下で落とす列にだけ u-col-hide-md-down が付く」が落ちること

- [ ] **Step 7: 全テスト・Lint・ビルドを通す**

以下を1行ずつ別々に実行する。

Run: `cd frontend && pnpm vitest run`
Expected: 全件 PASS

Run: `cd frontend && pnpm run lint`
Expected: exit 0

Run: `cd frontend && pnpm run build`
Expected: exit 0

- [ ] **Step 8: コミット**

```bash
cd frontend
git add src/components/browser/SymbolCoverageTable.tsx src/components/browser/__tests__/SymbolCoverageTable.test.tsx src/screens/BrowseScreen.tsx
git commit -m "feat(browse): 銘柄カバレッジ表を追加し未実行レシピ数を可視化"
```

---

## Task 4: E2E・スクリーンショット・文言を追随させる

**Files:**
- Modify: `frontend/e2e/specs/browse.spec.ts:76-84`
- Modify: `frontend/e2e/screenshots/capture.spec.ts:28`
- Modify: `frontend/src/components/browser/__tests__/CollapsibleSection.test.tsx`
- Modify: `docs/screenshots/ja/browse.png`, `docs/screenshots/en/browse.png`（再撮影）

**Interfaces:**
- Consumes: `SymbolCoverageTable` が `data-testid="symbol-coverage-collapsible"` の `CollapsibleSection` の中に置かれ、見出しは `銘柄カバレッジ` / `Symbol coverage`（Task 3 で実装）
- Produces: なし（最終タスク）

- [ ] **Step 1: E2E の期待値を新名称に直す**

`frontend/e2e/specs/browse.spec.ts` の次のテストを

```ts
  test('銘柄アトラスは既定で畳まれている', async ({ page }) => {
    await gotoBrowse(page)
    const toggle = page.getByTestId('symbol-atlas-collapsible').getByRole('button')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('heading', { name: /銘柄アトラス|Symbol Atlas/ })).toHaveCount(0)

    await toggle.click()
    await expect(page.getByRole('heading', { name: /銘柄アトラス|Symbol Atlas/ })).toBeVisible()
  })
```

次に置き換える。

```ts
  test('銘柄カバレッジは既定で畳まれている', async ({ page }) => {
    await gotoBrowse(page)
    const toggle = page.getByTestId('symbol-coverage-collapsible').getByRole('button')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('heading', { name: /銘柄カバレッジ|Symbol coverage/ })).toHaveCount(0)

    await toggle.click()
    await expect(page.getByRole('heading', { name: /銘柄カバレッジ|Symbol coverage/ })).toBeVisible()
  })
```

- [ ] **Step 2: 未実行列が出ることの E2E を 1 件足す**

同じ `test` の直後に追加する。フィクスチャの `idle_recipe`（v1 / v2）は全 variant が
未実行なので、未実行レシピが 1 件以上ある銘柄が必ず存在する。

```ts
  test('銘柄カバレッジに未実行列が出る', async ({ page }) => {
    await gotoBrowse(page)
    await page.getByTestId('symbol-coverage-collapsible').getByRole('button').click()
    await expect(page.getByRole('columnheader', { name: /未実行|Unrun/ })).toBeVisible()
  })
```

- [ ] **Step 3: E2E を実行する**

Run: `cd frontend && pnpm run e2e`
Expected: 全件 PASS（従来 13 件 + 追加 1 件）

- [ ] **Step 4: 単体テストのラベル文字列を実態に合わせる**

`frontend/src/components/browser/__tests__/CollapsibleSection.test.tsx` を次のように直す（全 5 箇所）。

| 行 | 現在 | 変更後 |
|---|---|---|
| 9 / 19 / 42 | `label="銘柄アトラス（46 銘柄）"` | `label="銘柄カバレッジ（47 銘柄 · 未実行 139 レシピ）"` |
| 14 / 23 | `name: /銘柄アトラス/` | `name: /銘柄カバレッジ/` |

46 行目の `expect(screen.getByText(/46 銘柄/))` は `/47 銘柄/` に直す。

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/CollapsibleSection.test.tsx`
Expected: PASS

- [ ] **Step 5: 撮影スクリプトのコメントを直す**

`frontend/e2e/screenshots/capture.spec.ts` の 28 行目

```
 * - hero（browse）はコンテキスト維持のため縦長 viewport でヘッダー＋銘柄アトラスを収める。
```

を次に置き換える。

```
 * - hero（browse）はコンテキスト維持のため縦長 viewport でヘッダー＋表を収める。
```

- [ ] **Step 6: スクリーンショットを再撮影する**

Run: `cd frontend && pnpm run screenshots`
Expected: exit 0。`docs/screenshots/{ja,en}/browse.png` が更新される

- [ ] **Step 7: 全ゲートを通す**

以下を1行ずつ別々に実行する。

Run: `cd frontend && pnpm vitest run`
Expected: 全件 PASS

Run: `cd frontend && pnpm run lint`
Expected: exit 0

Run: `cd frontend && pnpm run build`
Expected: exit 0

Run: `uv run pytest tests/ -q`（リポジトリルートで実行）
Expected: 全件 PASS（バックエンド無変更の回帰確認）

Run: `uv run ruff check src/ tests/`（リポジトリルートで実行）
Expected: exit 0

- [ ] **Step 8: 実データで行数と高さを実測する**

設計仕様 §7 で「47 行 × 約 36px ≒ 1,700px」と見積もった。実測して差があれば
そのまま報告する（issue #334 の行高の環境差が効く可能性がある）。

```bash
cd /Users/sakae/dev/alpha-trade/alpha-visualizer
uv run alpha-vis serve --forge-dir ../alpha-strategies --port 8918
```

ブラウザで `http://127.0.0.1:8918/browse` を 1440×900 で開き、銘柄カバレッジを展開して
次を実行する。

```js
const rows = [...document.querySelectorAll('table tbody tr')]
const tally = {}
rows.forEach(r => { const h = Math.round(r.getBoundingClientRect().height); tally[h] = (tally[h] || 0) + 1 })
console.log({ tally, docHeight: document.documentElement.scrollHeight })
```

- [ ] **Step 9: コミット**

```bash
cd /Users/sakae/dev/alpha-trade/alpha-visualizer
git add frontend/e2e/specs/browse.spec.ts frontend/e2e/screenshots/capture.spec.ts frontend/src/components/browser/__tests__/CollapsibleSection.test.tsx docs/screenshots/
git commit -m "test(browse): 銘柄カバレッジ表に合わせて E2E・文言・スクリーンショットを更新"
```
