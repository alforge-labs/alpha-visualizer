# ブラウズ画面のレシピ・ロールアップ 実装計画（SP1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウズ画面の表示単位を `strategy_id` から「レシピ」＝`(name, 実効銘柄, timeframe)` へ変え、実データ 475 戦略で 475 行 43,483px を 136 行 約 6,460px にする。

**Architecture:** `GET /api/strategies` のレスポンス（変更なし）を `lib/recipes.ts` の純関数でレシピへ畳み、`useStrategyList` が絞り込み → ロールアップ → 未実行除外 → ソート → グループ化の順で流す。`StrategyTable` はレシピ行を描画し、展開時に既存の 1 戦略行を子行として出す。バックエンド・`alpha-forge` には一切触らない。

**Tech Stack:** React 19 / TypeScript / Vite / vitest / @testing-library/react / Playwright / pnpm

設計は [`docs/superpowers/specs/2026-07-26-browse-recipe-rollup-design.md`](../specs/2026-07-26-browse-recipe-rollup-design.md)。

## Global Constraints

- コメント・コミットメッセージ・UI 文言（日本語側）はすべて日本語で書く。
- パッケージマネージャは **pnpm** のみ（`frontend/pnpm-lock.yaml`）。Python 側は `uv`。
- `any` 型は禁止。型が不明なら `unknown` を使って絞り込む。
- 全ての export 関数に引数と戻り値の型を明示する。
- `screens/<Name>Screen.tsx` は `useState` / `useEffect` / fetch hook を呼んではならない（`frontend/CLAUDE.md` / ADR-0001）。ローカル state が必要なら `components/` 側のコンポーネントに持たせる。
- `frontend` の型チェックは `pnpm run build`（`tsc -b && vite build`）で行う。**`tsc --noEmit` は `tsconfig.json` が `files: []` のため常に exit 0 になり検証にならない。**
- ミューテーション禁止。配列のソートは `[...arr].sort(...)` のようにコピーしてから行う。
- 実効銘柄の判定は `lib/recipes.ts` の `effectiveSymbol` に一本化し、`item.symbol` を直接読む箇所を残さない。
- `??` と `||` を取り違えないこと。実効銘柄のフォールバックは空文字列も次候補へ流す必要があるため `||` を使う。
- `docs/screenshots/{ja,en}/` の再撮影は **Task 7 で一度だけ**行う。Task 2〜5 はいずれも視覚を変えるが、途中で撮り直しても次のタスクで無効になるため、各タスクでは撮影しない（撮影漏れではない）。
- **すべてのコミットで `pnpm run build`（`tsc -b && vite build`）が通ること。** ビルド不能な中間コミットを作らない。
- Python 側 `db.py` のスキーマは変更しない。したがって `samples/build_samples.py` の再生成は不要。
- 各タスクの完了時にコミットする。コミットメッセージは Conventional Commits（`feat:` / `refactor:` / `test:` / `docs:`）。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `frontend/src/lib/recipes.ts`（新規） | レシピのロールアップ。`effectiveSymbol` / `pickBestVariant` / `buildRecipes` と `Recipe` 型。React 非依存の純関数のみ |
| `frontend/src/lib/__tests__/recipes.test.ts`（新規） | 上記の単体テスト |
| `frontend/src/hooks/useStrategyList.ts`（変更） | 絞り込み → ロールアップ → 未実行除外 → ソート → グループ化のパイプライン。`include_unrun` の URL 往復 |
| `frontend/src/components/browser/StrategyRow.tsx`（新規） | 単一戦略の 1 行。レシピ展開時の子行にもなる |
| `frontend/src/components/browser/RecipeRow.tsx`（新規） | 折り畳み時のレシピ 1 行。指標は `best` 1 件から取る |
| `frontend/src/components/browser/StrategyTableFooter.tsx`（新規） | 表示件数・除外件数の開示 |
| `frontend/src/components/browser/CollapsibleSection.tsx`（新規） | 開閉 state を自前で持つ折り畳み。銘柄アトラスと銘柄チップで再利用 |
| `frontend/src/components/browser/StrategyTable.tsx`（変更） | レシピ行・子行の組み立てと展開 state。行の描画自体は上記 2 コンポーネントへ委譲 |
| `frontend/src/components/browser/FilterBar.tsx`（変更） | 銘柄チップの折り畳み、未実行トグル |
| `frontend/src/components/browser/SavedViews.tsx`（変更） | `FILTER_KEYS` に `include_unrun` を追加 |
| `frontend/src/components/browser/Heroline.tsx`（変更） | 横一列化、銘柄数を実効銘柄で数える |
| `frontend/src/hooks/useSymbolStats.ts`（変更） | 銘柄判定を実効銘柄に統一 |
| `frontend/src/screens/BrowseScreen.tsx`（変更） | ヒーロー圧縮、銘柄アトラスの折り畳み |
| `tests/fixtures/build_e2e_fixture.py`（変更） | 多 variant レシピ・未実行・同名別銘柄・銘柄未設定の戦略を追加 |
| `frontend/e2e/specs/browse.spec.ts`（変更） | ロールアップ・展開・件数開示の E2E |

## タスク一覧

| # | 内容 | 依存 |
|---|---|---|
| 1 | `lib/recipes.ts` — ロールアップの純関数 | — |
| 2 | `StrategyRow.tsx` — 1 行 44px 化と `strategy_id` 表示 | 1 |
| 3 | レシピのパイプラインと表の描画（`useStrategyList` + `RecipeRow` + `StrategyTable`） | 1,2 |
| 4 | `StrategyTableFooter.tsx` — 件数開示 | 3 |
| 5 | クローム圧縮（ヒーロー・アトラス折り畳み・チップ折り畳み・未実行トグル） | 1,3 |
| 6 | E2E fixture 拡張と E2E テスト | 4,5 |
| 7 | 実データ検証・スクリーンショット再撮影・最終ゲート | 6 |

**Task 3 が大きいのは意図的。** `StrategyGroup.items` を `Recipe[]` に変える型変更は、
`StrategyTable` が追随するまで `pnpm run build` を通せない。hook 側と表側を別タスクに
分けるとビルド不能なコミットが 1 つ履歴に残るため、型変更とその消費側を同じコミットに
入れる。**この計画のすべてのコミットで `pnpm run build` が通る。**

---

### Task 1: `lib/recipes.ts` — ロールアップの純関数

**Files:**
- Create: `frontend/src/lib/recipes.ts`
- Test: `frontend/src/lib/__tests__/recipes.test.ts`

**Interfaces:**
- Consumes: `StrategyListItem`（`frontend/src/api/types.ts` の `S['StrategySummary']`）。関係するフィールドは `strategy_id: string` / `name: string` / `symbol?: string | null` / `timeframe?: string | null` / `target_symbols: string[]` / `latest_sharpe?: number | null` / `latest_return_pct?: number | null` / `latest_max_drawdown_pct?: number | null` / `latest_profit_factor?: number | null` / `latest_win_rate_pct?: number | null` / `last_run_at?: string | null` / `latest_source?: string | null`
- Produces:
  - `export interface Recipe { key: string; name: string; symbol: string | null; timeframe: string | null; variants: StrategyListItem[]; best: StrategyListItem | null; variantCount: number; runCount: number }`
  - `export function effectiveSymbol(item: StrategyListItem): string | null`
  - `export function pickBestVariant(variants: StrategyListItem[]): StrategyListItem | null`
  - `export function buildRecipes(items: StrategyListItem[]): Recipe[]`

- [ ] **Step 1: テストヘルパと最初の失敗するテストを書く**

`frontend/src/lib/__tests__/recipes.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import type { StrategyListItem } from '../../api/types'
import { buildRecipes, effectiveSymbol, pickBestVariant } from '../recipes'

/** 必要なフィールドだけ上書きできる StrategyListItem のファクトリ。 */
function item(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
    strategy_id: overrides.strategy_id,
    name: 'Recipe A',
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

describe('effectiveSymbol', () => {
  it('実行済みなら実際に回した symbol を定義側より優先する', () => {
    // 定義は SPY だが実際に回したのは QQQ。表示・グループ化は実績が真。
    const s = item({ strategy_id: 'a', symbol: 'QQQ', target_symbols: ['SPY'] })
    expect(effectiveSymbol(s)).toBe('QQQ')
  })

  it('symbol が無ければ target_symbols の先頭へフォールバックする', () => {
    const s = item({ strategy_id: 'a', symbol: null, target_symbols: ['SPY', 'QQQ'] })
    expect(effectiveSymbol(s)).toBe('SPY')
  })

  it('symbol が空文字列でも target_symbols へフォールバックする', () => {
    // API は None を返すが、空文字列が来ても定義側に落ちること（?? では通ってしまう）
    const s = item({ strategy_id: 'a', symbol: '', target_symbols: ['SPY'] })
    expect(effectiveSymbol(s)).toBe('SPY')
  })

  it('どちらも無ければ null を返す', () => {
    const s = item({ strategy_id: 'a', symbol: null, target_symbols: [] })
    expect(effectiveSymbol(s)).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: FAIL — `Failed to resolve import "../recipes"`

- [ ] **Step 3: `effectiveSymbol` を実装する**

`frontend/src/lib/recipes.ts` を新規作成する。

```ts
import type { StrategyListItem } from '../api/types'

/**
 * レシピ = 同一の (name, 実効銘柄, timeframe) を持つ戦略群。
 *
 * `/explore-strategies` の反復ランは同じレシピのパラメータ違いを何件も生む
 * （実データでは最大 15 件が完全同名）。1 件ずつ行にすると同じものが並ぶだけ
 * なので、レシピを表示単位にして展開で個別戦略を見せる。
 */
export interface Recipe {
  /** グループ化キー。React の key と展開状態の識別に使う。 */
  key: string
  name: string
  /** 実効銘柄。variants は全員これと一致する。 */
  symbol: string | null
  timeframe: string | null
  /** 属する戦略。latest_sharpe 降順（null は末尾）。 */
  variants: StrategyListItem[]
  /**
   * レシピを代表する 1 件。行に出す指標はすべてこれから取る。
   * `runCount === 0` のときだけ null（不変条件）。
   */
  best: StrategyListItem | null
  variantCount: number
  runCount: number
}

/**
 * 表示・グループ化・絞り込みに使う銘柄を決める。
 *
 * `symbol` は最新バックテストが実際に回した銘柄、`target_symbols[0]` は戦略
 * 定義上の対象銘柄。実行済みなら実際に回した銘柄が真なので、この優先順を
 * 逆にしてはならない。
 *
 * `??` ではなく `||` を使う。API は `None` を返すため通常は `null` だが、空
 * 文字列が来た場合も定義側へ流したい（`??` は空文字列を通してしまう）。
 * `target_symbols` が空配列なら `[0]` は `undefined` になるので最後に
 * `|| null` で正規化する。
 */
export function effectiveSymbol(item: StrategyListItem): string | null {
  return item.symbol || item.target_symbols[0] || null
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: `pickBestVariant` の失敗するテストを追記する**

`recipes.test.ts` に追記する。

```ts
describe('pickBestVariant', () => {
  it('latest_sharpe が最大の variant を返す', () => {
    const best = pickBestVariant([
      item({ strategy_id: 'a', latest_sharpe: 0.4, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'b', latest_sharpe: 1.2, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'c', latest_sharpe: 0.9, last_run_at: '2026-01-01T00:00:00' }),
    ])
    expect(best?.strategy_id).toBe('b')
  })

  it('Sharpe が同値なら last_run_at が新しい方を返す', () => {
    const best = pickBestVariant([
      item({ strategy_id: 'old', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'new', latest_sharpe: 1.0, last_run_at: '2026-06-01T00:00:00' }),
    ])
    expect(best?.strategy_id).toBe('new')
  })

  it('Sharpe が全て null でも実行済みがあれば最新ランを返す', () => {
    // best === null と runCount === 0 を等価に保つための経路。
    // Sharpe だけで選ぶ実装だと null になり、行が「未実行」に見えてしまう。
    const best = pickBestVariant([
      item({ strategy_id: 'old', latest_sharpe: null, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'new', latest_sharpe: null, last_run_at: '2026-06-01T00:00:00' }),
    ])
    expect(best?.strategy_id).toBe('new')
  })

  it('実行済みが 1 件も無ければ null を返す', () => {
    const best = pickBestVariant([
      item({ strategy_id: 'a', latest_sharpe: null, last_run_at: null }),
      item({ strategy_id: 'b', latest_sharpe: null, last_run_at: null }),
    ])
    expect(best).toBeNull()
  })
})
```

- [ ] **Step 6: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: FAIL — `pickBestVariant is not a function`

- [ ] **Step 7: `pickBestVariant` を実装する**

`frontend/src/lib/recipes.ts` に追記する。

```ts
/** バックテストを 1 度でも実行したか。 */
function hasRun(item: StrategyListItem): boolean {
  return item.last_run_at != null && item.last_run_at !== ''
}

/** last_run_at の比較用。null / 空は最も古いものとして扱う。 */
function runStamp(item: StrategyListItem): string {
  return item.last_run_at ?? ''
}

/**
 * レシピを代表する 1 件を選ぶ。
 *
 * 1. `latest_sharpe` が非 null のうち最大。同値なら `last_run_at` が新しい方
 * 2. 全て null なら、実行済みのうち `last_run_at` が最も新しいもの
 * 3. 実行済みが無ければ null
 *
 * 2 段目があるので `best === null` は `runCount === 0` と等価になる。これを
 * 崩すと「実行済みなのに行が未実行に見える」状態が生まれる。
 */
export function pickBestVariant(variants: StrategyListItem[]): StrategyListItem | null {
  let bySharpe: StrategyListItem | null = null
  for (const v of variants) {
    if (v.latest_sharpe == null) continue
    if (bySharpe == null) {
      bySharpe = v
      continue
    }
    const currentSharpe = bySharpe.latest_sharpe as number
    if (v.latest_sharpe > currentSharpe) bySharpe = v
    else if (v.latest_sharpe === currentSharpe && runStamp(v) > runStamp(bySharpe)) bySharpe = v
  }
  if (bySharpe != null) return bySharpe

  let byRun: StrategyListItem | null = null
  for (const v of variants) {
    if (!hasRun(v)) continue
    if (byRun == null || runStamp(v) > runStamp(byRun)) byRun = v
  }
  return byRun
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: PASS（8 件）

- [ ] **Step 9: `buildRecipes` の失敗するテストを追記する**

`recipes.test.ts` に追記する。

```ts
describe('buildRecipes', () => {
  it('同名・同銘柄・同時間軸を 1 レシピに畳む', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'v1', name: 'AMD EMA ST', symbol: 'AMD', latest_sharpe: 0.5, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'v2', name: 'AMD EMA ST', symbol: 'AMD', latest_sharpe: 0.8, last_run_at: '2026-01-02T00:00:00' }),
      item({ strategy_id: 'v3', name: 'AMD EMA ST', symbol: 'AMD' }),
    ])
    expect(recipes).toHaveLength(1)
    expect(recipes[0].variantCount).toBe(3)
    expect(recipes[0].runCount).toBe(2)
    expect(recipes[0].best?.strategy_id).toBe('v2')
  })

  it('同名でも銘柄が違えば別レシピにする', () => {
    // 実データでは "KAMA + RSI(loose) + 4h Trend + Tight Trailing SL" が
    // AUDUSD / EURUSD / GBPUSD / USDJPY にまたがる。name だけを鍵にすると
    // 4 通貨ペアが 1 行に潰れて別物が混ざる。
    const recipes = buildRecipes([
      item({ strategy_id: 'aud', name: 'KAMA RSI', symbol: 'AUDUSD=X' }),
      item({ strategy_id: 'eur', name: 'KAMA RSI', symbol: 'EURUSD=X' }),
    ])
    expect(recipes).toHaveLength(2)
    expect(recipes.map(r => r.symbol).sort()).toEqual(['AUDUSD=X', 'EURUSD=X'])
  })

  it('同名・同銘柄でも時間軸が違えば別レシピにする', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'd', name: 'X', symbol: 'SPY', timeframe: '1d' }),
      item({ strategy_id: 'h', name: 'X', symbol: 'SPY', timeframe: '1h' }),
    ])
    expect(recipes).toHaveLength(2)
  })

  it('定義のみで銘柄が判明する戦略も実効銘柄で畳む', () => {
    // 実行済み（symbol=SPY）と未実行（target_symbols=[SPY]）が同じレシピに入る
    const recipes = buildRecipes([
      item({ strategy_id: 'ran', name: 'X', symbol: 'SPY', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'unrun', name: 'X', symbol: null, target_symbols: ['SPY'] }),
    ])
    expect(recipes).toHaveLength(1)
    expect(recipes[0].symbol).toBe('SPY')
    expect(recipes[0].variantCount).toBe(2)
    expect(recipes[0].runCount).toBe(1)
  })

  it('レシピ行の指標は best 1 件から取り、列ごとの最大を混ぜない', () => {
    // Sharpe 最大は v1、リターン最大は v2。行は v1 のリターンを出さなければ
    // ならない。列ごとに Math.max を取る実装だと存在しない戦略の成績になる。
    const recipes = buildRecipes([
      item({ strategy_id: 'v1', name: 'X', symbol: 'SPY', latest_sharpe: 1.5, latest_return_pct: 10, latest_max_drawdown_pct: -30, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'v2', name: 'X', symbol: 'SPY', latest_sharpe: 0.5, latest_return_pct: 99, latest_max_drawdown_pct: -5, last_run_at: '2026-01-02T00:00:00' }),
    ])
    expect(recipes[0].best?.strategy_id).toBe('v1')
    expect(recipes[0].best?.latest_return_pct).toBe(10)
    expect(recipes[0].best?.latest_max_drawdown_pct).toBe(-30)
  })

  it('全 variant が未実行なら best は null で runCount は 0', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'a', name: 'X', symbol: 'SPY' }),
      item({ strategy_id: 'b', name: 'X', symbol: 'SPY' }),
    ])
    expect(recipes[0].best).toBeNull()
    expect(recipes[0].runCount).toBe(0)
  })

  it('best が null であることと runCount が 0 であることは同値', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'a', name: 'A', symbol: 'SPY' }),
      item({ strategy_id: 'b', name: 'B', symbol: 'SPY', last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'c', name: 'C', symbol: 'SPY', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
    ])
    for (const r of recipes) {
      expect(r.best === null).toBe(r.runCount === 0)
    }
  })

  it('variants は latest_sharpe 降順で null が末尾', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'none', name: 'X', symbol: 'SPY' }),
      item({ strategy_id: 'low', name: 'X', symbol: 'SPY', latest_sharpe: 0.2, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'high', name: 'X', symbol: 'SPY', latest_sharpe: 1.4, last_run_at: '2026-01-01T00:00:00' }),
    ])
    expect(recipes[0].variants.map(v => v.strategy_id)).toEqual(['high', 'low', 'none'])
  })

  it('区切り文字を含む名前でもキーが衝突しない', () => {
    // ("A|B", null 銘柄) と ("A", "B" 銘柄) が同じキーにならないこと
    const recipes = buildRecipes([
      item({ strategy_id: 'x', name: 'A|B', symbol: null, target_symbols: [], timeframe: '1d' }),
      item({ strategy_id: 'y', name: 'A', symbol: 'B', timeframe: '1d' }),
    ])
    expect(recipes).toHaveLength(2)
  })

  it('空配列なら空配列を返す', () => {
    expect(buildRecipes([])).toEqual([])
  })
})
```

- [ ] **Step 10: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: FAIL — `buildRecipes is not a function`

- [ ] **Step 11: `buildRecipes` を実装する**

`frontend/src/lib/recipes.ts` に追記する。

```ts
/**
 * ロールアップキー。
 *
 * 区切りに `\u0000` を使う。銘柄名・レシピ名・時間軸のいずれにも現れないため
 * ("A|B", 銘柄なし) と ("A", "B") のような衝突が起きない。
 */
function recipeKey(name: string, symbol: string | null, timeframe: string | null): string {
  return `${name}\u0000${symbol ?? ''}\u0000${timeframe ?? ''}`
}

/** latest_sharpe 降順。null は末尾。同値は last_run_at が新しい方を先に。 */
function compareVariants(a: StrategyListItem, b: StrategyListItem): number {
  const sa = a.latest_sharpe
  const sb = b.latest_sharpe
  if (sa == null && sb == null) return runStamp(b).localeCompare(runStamp(a))
  if (sa == null) return 1
  if (sb == null) return -1
  if (sa !== sb) return sb - sa
  return runStamp(b).localeCompare(runStamp(a))
}

interface Bucket {
  name: string
  symbol: string | null
  timeframe: string | null
  items: StrategyListItem[]
}

/**
 * 戦略一覧をレシピへ畳む。返り値の順序は入力の初出順（並べ替えは呼び出し側）。
 */
export function buildRecipes(items: StrategyListItem[]): Recipe[] {
  const buckets = new Map<string, Bucket>()
  for (const item of items) {
    const symbol = effectiveSymbol(item)
    const timeframe = item.timeframe ?? null
    const key = recipeKey(item.name, symbol, timeframe)
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      buckets.set(key, { name: item.name, symbol, timeframe, items: [item] })
    }
  }

  const out: Recipe[] = []
  for (const [key, bucket] of buckets) {
    const variants = [...bucket.items].sort(compareVariants)
    out.push({
      key,
      name: bucket.name,
      symbol: bucket.symbol,
      timeframe: bucket.timeframe,
      variants,
      best: pickBestVariant(variants),
      variantCount: variants.length,
      runCount: variants.filter(hasRun).length,
    })
  }
  return out
}
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: PASS（18 件）

- [ ] **Step 13: Lint と型チェック**

Run: `cd frontend && pnpm run lint && pnpm run build`
Expected: どちらも exit 0

- [ ] **Step 14: コミット**

```bash
git add frontend/src/lib/recipes.ts frontend/src/lib/__tests__/recipes.test.ts
git commit -m "feat(browse): レシピ・ロールアップの純関数を追加

同名の戦略は /explore-strategies の反復ランが生む同一レシピのパラメータ
違い（実データで最大 15 件）なので、(name, 実効銘柄, timeframe) を鍵に
畳む。name だけを鍵にすると 6 グループで別銘柄が混ざる。

行に出す指標は best 1 件から取る。列ごとに最大を取ると実在しない戦略の
成績を合成表示することになるため、テストで固定した。"
```

- [ ] **Step 15: ablation でテストの判別力を確認する**

コミット済みなので安全に壊せる。次の 3 つを 1 つずつ入れて、想定したテストが落ちることを確認し、毎回 `git checkout -- frontend/src/lib/recipes.ts` で戻す。

| 退行のさせ方 | 落ちるべきテスト |
|---|---|
| `effectiveSymbol` の `||` を `??` に変える | 「symbol が空文字列でも target_symbols へフォールバックする」 |
| `recipeKey` から `symbol` を除く | 「同名でも銘柄が違えば別レシピにする」 |
| `best` を使わず各指標を `Math.max` で集計する（`latest_return_pct` を variants の最大に差し替える） | 「レシピ行の指標は best 1 件から取り、列ごとの最大を混ぜない」 |

Run（各退行ごとに）: `cd frontend && pnpm vitest run src/lib/__tests__/recipes.test.ts`
Expected: 対応するテストが FAIL し、他は PASS のまま

3 つ確認したら `git status` で作業ツリーがクリーン（退行が残っていない）ことを確かめる。

---

### Task 2: `StrategyRow.tsx` — 1 行 44px 化と `strategy_id` 表示

**Files:**
- Create: `frontend/src/components/browser/StrategyRow.tsx`
- Modify: `frontend/src/components/browser/StrategyTable.tsx`（`StrategyRow` の定義を削除して import に置き換える）
- Test: `frontend/src/components/browser/__tests__/StrategyRow.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の `effectiveSymbol`
- Produces:
  ```ts
  export interface StrategyRowProps {
    s: StrategyListItem
    selected: boolean
    inCompare: boolean
    maxCompareReached: boolean
    onSelect: (id: string) => void
    onToggleCompare: (id: string) => void
    onHover: (id: string | null) => void
    sparkValues: number[] | 'loading' | 'empty' | undefined
    lang: Lang
    /** レシピ展開時の子行として描画する（名前セルを字下げする） */
    indent?: boolean
  }
  export function StrategyRow(props: StrategyRowProps): React.ReactElement
  export const TD_BASE: CSSProperties
  export function sharpeTone(v: number | null | undefined): string
  ```
  `TD_BASE` と `sharpeTone` は `RecipeRow`（Task 3）と `StrategyTable` が共有するため export する。

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/browser/__tests__/StrategyRow.test.tsx` を新規作成する。

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { StrategyRow } from '../StrategyRow'

function mkItem(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
    strategy_id: overrides.strategy_id,
    name: 'SPY EMA Cross v1',
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

function renderRow(s: StrategyListItem, indent = false) {
  return render(
    <MemoryRouter>
      <table><tbody>
        <StrategyRow
          s={s}
          selected={false}
          inCompare={false}
          maxCompareReached={false}
          onSelect={vi.fn()}
          onToggleCompare={vi.fn()}
          onHover={vi.fn()}
          sparkValues={undefined}
          lang="ja"
          indent={indent}
        />
      </tbody></table>
    </MemoryRouter>,
  )
}

describe('<StrategyRow />', () => {
  it('strategy_id を表示する', () => {
    // 実データでは同名 15 件が存在し、ID が唯一の識別子になる
    renderRow(mkItem({ strategy_id: 'amd_ema_st_repeat2_v1_optimized' }))
    expect(screen.getByText('amd_ema_st_repeat2_v1_optimized')).toBeInTheDocument()
  })

  it('未実行でも target_symbols から銘柄チップを出す', () => {
    // 実データでは 311 件がこの経路。symbol だけを見ると空欄になる
    renderRow(mkItem({ strategy_id: 'a', symbol: null, target_symbols: ['SPY'] }))
    expect(screen.getByText('SPY')).toBeInTheDocument()
    expect(screen.queryByText(/未割当/)).toBeNull()
  })

  it('実行済みなら実際に回した銘柄を定義側より優先して出す', () => {
    renderRow(mkItem({ strategy_id: 'a', symbol: 'QQQ', target_symbols: ['SPY'] }))
    expect(screen.getByText('QQQ')).toBeInTheDocument()
    expect(screen.queryByText('SPY')).toBeNull()
  })

  it('銘柄がどこからも判明しなければ未割当と出す', () => {
    renderRow(mkItem({ strategy_id: 'a', symbol: null, target_symbols: [] }))
    expect(screen.getByText(/未割当/)).toBeInTheDocument()
  })

  it('名前は詳細画面へのリンクになっている', () => {
    renderRow(mkItem({ strategy_id: 'sma_cross' }))
    const link = screen.getByRole('link', { name: /SPY EMA Cross v1/ })
    expect(link.getAttribute('href')).toBe('/detail/sma_cross')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/StrategyRow.test.tsx`
Expected: FAIL — `Failed to resolve import "../StrategyRow"`

- [ ] **Step 3: `StrategyRow.tsx` を作る**

`frontend/src/components/browser/StrategyTable.tsx` にある現在の `StrategyRow`・`TD_BASE`・`sharpeTone`・`HOVER_DELAY_MS` 以外の行関連定義を新ファイルへ移し、1 行構成に変える。`frontend/src/components/browser/StrategyRow.tsx`:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Chip } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { fmtNumber, fmtDate } from '../../lib/format'
import { effectiveSymbol } from '../../lib/recipes'
import { RUN_SOURCE_STRATEGY_FILE } from '../../constants/runSource'

export function sharpeTone(v: number | null | undefined): string {
  if (v == null) return 'var(--text3)'
  if (v >= 1.5) return 'var(--success)'
  if (v >= 1.0) return 'var(--warn)'
  return 'var(--danger)'
}

/**
 * セルの共通スタイル。padding を 14px から 8px に詰め、名前・ID・チップを
 * 1 行に収めることで行高を 86px から 44px 前後にする。フォントサイズは
 * 可読性のため変えない。
 */
export const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  padding: '8px 12px',
  textAlign: 'right',
  borderBottom: '1px solid var(--border)',
  letterSpacing: 'var(--tracking-mono)',
}

export interface StrategyRowProps {
  s: StrategyListItem
  selected: boolean
  inCompare: boolean
  maxCompareReached: boolean
  onSelect: (id: string) => void
  onToggleCompare: (id: string) => void
  onHover: (id: string | null) => void
  sparkValues: number[] | 'loading' | 'empty' | undefined
  lang: Lang
  /** レシピ展開時の子行として描画する（名前セルを字下げする） */
  indent?: boolean
}

export function StrategyRow({
  s,
  selected,
  inCompare,
  maxCompareReached,
  onSelect,
  onToggleCompare,
  onHover,
  sparkValues,
  lang,
  indent = false,
}: StrategyRowProps): React.ReactElement {
  const L = makeL(lang)
  const [isHovered, setHovered] = useState(false)
  const symbol = effectiveSymbol(s)

  const handleEnter = (): void => {
    setHovered(true)
    onHover(s.strategy_id)
  }

  const handleLeave = (): void => {
    setHovered(false)
    onHover(null)
  }

  const trBackground = selected
    ? 'var(--accent-bg)'
    : isHovered
      ? 'var(--surface-2)'
      : 'transparent'

  const sparkRendered =
    Array.isArray(sparkValues) && sparkValues.length >= 2 ? (
      <Sparkline values={sparkValues} width={120} height={20} />
    ) : sparkValues === 'loading' ? (
      <div
        style={{
          width: 120,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
        }}
      >
        ···
      </div>
    ) : null

  return (
    <tr
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={() => onSelect(s.strategy_id)}
      title={L('クリックでプレビュー', 'Click to preview')}
      style={{
        background: trBackground,
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background var(--motion-fast)',
        cursor: 'pointer',
      }}
    >
      <td
        style={{ ...TD_BASE, textAlign: 'center', padding: '6px 4px', width: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={inCompare}
          disabled={maxCompareReached}
          aria-label={L(`${s.name} を比較に追加`, `Add ${s.name} to compare`)}
          onChange={() => onToggleCompare(s.strategy_id)}
          style={{
            cursor: maxCompareReached ? 'not-allowed' : 'pointer',
            accentColor: 'var(--accent)',
          }}
        />
      </td>
      <td style={{ ...TD_BASE, textAlign: 'left', paddingLeft: indent ? 40 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Link
            to={`/detail/${s.strategy_id}`}
            title={s.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--serif)',
              fontSize: '1.0625rem',
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.005em',
              lineHeight: 1.2,
              textDecoration: 'none',
              transition: 'color var(--motion-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text)' }}
          >
            {s.name}
          </Link>
          <span
            title={s.strategy_id}
            style={{
              flexShrink: 0,
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {s.strategy_id}
          </span>
          {symbol ? <Chip>{symbol}</Chip> : null}
          {s.timeframe ? <Chip>{s.timeframe}</Chip> : null}
          {!symbol && !s.timeframe && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
              }}
            >
              {L('未割当', 'unassigned')}
            </span>
          )}
        </div>
      </td>
      <td style={{ ...TD_BASE, color: sharpeTone(s.latest_sharpe), fontWeight: 700, fontSize: '1rem' }}>
        {fmtNumber(s.latest_sharpe, { decimals: 2 })}
        {s.latest_source === RUN_SOURCE_STRATEGY_FILE && (
          <span
            data-testid="latest-source-badge"
            role="img"
            aria-label={L(
              '最新ランはチューニング試行（保存していないパラメータ）です',
              'Latest run is a tuning trial with unsaved parameters',
            )}
            title={L(
              '最新ランはチューニング試行（保存していないパラメータ）です',
              'Latest run is a tuning trial with unsaved parameters',
            )}
            style={{ marginLeft: 4, color: 'var(--warn)', fontSize: 10 }}
          >
            ⚠
          </span>
        )}
      </td>
      <td
        style={{
          ...TD_BASE,
          color:
            s.latest_return_pct == null
              ? 'var(--text3)'
              : s.latest_return_pct >= 0
                ? 'var(--success)'
                : 'var(--danger)',
        }}
      >
        {fmtNumber(s.latest_return_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td style={{ ...TD_BASE, color: s.latest_max_drawdown_pct == null ? 'var(--text3)' : 'var(--danger)' }}>
        {fmtNumber(s.latest_max_drawdown_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(s.latest_profit_factor, { decimals: 2 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(s.latest_win_rate_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, color: 'var(--text3)', fontSize: 'var(--fs-mono-sm)', textAlign: 'right' }}
      >
        {fmtDate(s.last_run_at)}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, padding: '6px 12px', width: 132, textAlign: 'right' }}
      >
        <div style={{ display: 'inline-flex', justifyContent: 'flex-end', minHeight: 20 }}>
          {sparkRendered}
        </div>
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: `StrategyTable.tsx` から重複定義を消して import に置き換える**

`StrategyTable.tsx` の `sharpeTone` / `TD_BASE` / `RowProps` / `StrategyRow` の定義を削除し、次の import を追加する。`TH_BASE` と `GroupHeaderRow` と空状態は `StrategyTable.tsx` に残す。

```tsx
import { StrategyRow, TD_BASE, sharpeTone } from './StrategyRow'
```

`GroupHeaderRow` も `padding` を詰めておく（行高を揃えるため `TD_BASE` を共有しているのでそのまま追随する）。

- [ ] **Step 5: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/StrategyRow.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 6: 既存の StrategyTable テストが壊れていないことを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/StrategyTable.test.tsx`
Expected: PASS（空状態の 2 件。このタスクでは props を変えていないため通る）

- [ ] **Step 7: Lint**

Run: `cd frontend && pnpm run lint`
Expected: exit 0

`pnpm run build` もこの時点で通る。props の型は変えていないため。Task 3 で `recipes` を受けるように変える。

- [ ] **Step 8: コミット**

```bash
git add frontend/src/components/browser/StrategyRow.tsx \
        frontend/src/components/browser/StrategyTable.tsx \
        frontend/src/components/browser/__tests__/StrategyRow.test.tsx
git commit -m "refactor(browse): 戦略行を別ファイルへ切り出して 1 行 44px 化

名前・strategy_id・銘柄・時間軸を 1 行に収め padding を 14px から 8px へ
詰めた。フォントサイズは可読性のため変えていない。

strategy_id を表示するようにした。実データには完全同名が 15 件あり、行を
見て区別する手段が他に無い。

銘柄チップは実効銘柄で出す。item.symbol だけを見ていたため、定義のみで
銘柄が判明している 311 件が未割当と表示されていた。"
```

---

### Task 3: レシピのパイプラインと表の描画

`useStrategyList` の型変更とその追随（`RecipeRow` / `StrategyTable` / `BrowseScreen`）を
1 タスクにまとめる。`StrategyGroup.items` を `Recipe[]` に変える変更は、`StrategyTable`
が追随するまで `pnpm run build` を通せない。分けるとビルド不能なコミットが履歴に残るため、
型変更とその消費側を同じコミットに入れる。

**Files:**
- Modify: `frontend/src/hooks/useStrategyList.ts`
- Create: `frontend/src/components/browser/RecipeRow.tsx`
- Modify: `frontend/src/components/browser/StrategyTable.tsx`
- Modify: `frontend/src/screens/BrowseScreen.tsx`
- Test: `frontend/src/hooks/__tests__/useStrategyList.test.tsx`
- Test: `frontend/src/components/browser/__tests__/RecipeRow.test.tsx`（新規）
- Test: `frontend/src/components/browser/__tests__/StrategyTable.test.tsx`（props 変更に追随）

**Interfaces:**
- Consumes: Task 1 の `Recipe` / `buildRecipes` / `effectiveSymbol`
- Produces: `StrategyListState` に次を追加。`StrategyGroup.items` の型が `StrategyListItem[]` から `Recipe[]` へ変わる。
  - `recipes: Recipe[]` — 絞り込み・未実行除外・ソート済み
  - `recipeTotal: number` — 全戦略から作ったレシピ数（フィルタ非依存の分母）
  - `hiddenUnrunRecipeCount: number` — 未実行トグルで隠れているレシピ数
  - `includeUnrun: boolean`
  - `groups: StrategyGroup[]`（`items: Recipe[]`）

**Interfaces:**
- Consumes: Task 1 の `Recipe` / `buildRecipes` / `effectiveSymbol`、Task 2 の `StrategyRow` / `TD_BASE` / `sharpeTone`
- Produces:
  ```ts
  export interface RecipeRowProps {
    recipe: Recipe
    expanded: boolean
    onToggleExpand: (key: string) => void
    selectedId: string | null
    onSelect: (id: string) => void
    compareIds: string[]
    onToggleCompare: (id: string) => void
    onHover: (id: string | null) => void
    sparkValues: number[] | 'loading' | 'empty' | undefined
    lang: Lang
  }
  export function RecipeRow(props: RecipeRowProps): React.ReactElement
  ```
  `StrategyTable` の props は `items: StrategyListItem[]` / `total: number` から `recipes: Recipe[]` / `strategyTotal: number` へ変わる。`groups?: StrategyGroup[]` は型が変わるだけで名前は同じ。

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/__tests__/useStrategyList.test.tsx` の末尾に追記する。

既存ファイルのハーネスをそのまま使う。次の 3 点を守ること。

1. 戦略の注入は `vi.mocked(api.listStrategies).mockResolvedValue(...)` で行う。`beforeEach` で `SAMPLE` が入るので、別データを使うテストでは冒頭で上書きする
2. レンダリングは既存の `renderWithUrl(initialUrl)` を使う（新しいヘルパを作らない）
3. hook の値は **`result.current.list.X`** で読む（`result.current.X` ではない。`useHarness` が `{ list, search }` を返している）
4. `StrategyListItem` のリテラルは既存 `SAMPLE` と同じく必要なフィールドのみ書く（`tags` と `target_symbols` は必須）

```tsx
describe('useStrategyList — レシピ・ロールアップ', () => {
  // 同名 3 件（2 件実行済み・1 件未実行）＋ 全 variant 未実行のレシピ 1 件
  const ROLLUP: StrategyListItem[] = [
    { strategy_id: 'amd_v1', name: 'AMD EMA ST', symbol: 'AMD', timeframe: '1d', latest_sharpe: 0.5, last_run_at: '2026-01-01T00:00:00', tags: [], target_symbols: [] },
    { strategy_id: 'amd_v2', name: 'AMD EMA ST', symbol: 'AMD', timeframe: '1d', latest_sharpe: 0.9, last_run_at: '2026-01-02T00:00:00', tags: [], target_symbols: [] },
    { strategy_id: 'amd_v3', name: 'AMD EMA ST', symbol: null, timeframe: '1d', tags: [], target_symbols: ['AMD'] },
    { strategy_id: 'idle_v1', name: 'Idle Recipe', symbol: null, timeframe: '1d', tags: [], target_symbols: ['SPY'] },
  ]

  beforeEach(() => {
    vi.mocked(api.listStrategies).mockResolvedValue(ROLLUP)
  })

  it('未実行のみのレシピを既定で除外し、隠した件数を数える', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.recipes[0].name).toBe('AMD EMA ST')
    expect(result.current.list.recipes[0].variantCount).toBe(3)
    expect(result.current.list.recipes[0].runCount).toBe(2)
    expect(result.current.list.recipeTotal).toBe(2)
    expect(result.current.list.hiddenUnrunRecipeCount).toBe(1)
    expect(result.current.list.includeUnrun).toBe(false)
  })

  it('include_unrun=1 で未実行のみのレシピも出す', async () => {
    const { result } = renderWithUrl('/browse?include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(2)
    expect(result.current.list.hiddenUnrunRecipeCount).toBe(0)
    expect(result.current.list.includeUnrun).toBe(true)
  })

  it('銘柄フィルタが定義のみで判明する銘柄にも効く', async () => {
    // idle_v1 は symbol=null / target_symbols=['SPY']。実効銘柄で絞り込まない
    // 実装だとチップには SPY が出るのに選ぶと 0 件になる。
    const { result } = renderWithUrl('/browse?symbol=SPY&include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.recipes[0].name).toBe('Idle Recipe')
  })

  it('銘柄の選択肢を実効銘柄から作る', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    // amd_v3 と idle_v1 は symbol=null。定義側を見ないと AMD だけになる
    expect(result.current.list.symbols).toEqual(['AMD', 'SPY'])
  })

  it('レシピを best の指標でソートする', async () => {
    vi.mocked(api.listStrategies).mockResolvedValue([
      { strategy_id: 'lo', name: 'Low', symbol: 'SPY', timeframe: '1d', latest_sharpe: 0.3, last_run_at: '2026-01-01T00:00:00', tags: [], target_symbols: [] },
      { strategy_id: 'hi', name: 'High', symbol: 'QQQ', timeframe: '1d', latest_sharpe: 1.8, last_run_at: '2026-01-01T00:00:00', tags: [], target_symbols: [] },
    ])
    const { result } = renderWithUrl('/browse?sort=latest_sharpe&dir=desc')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes.map(r => r.name)).toEqual(['High', 'Low'])
  })

  it('groups はレシピを束ねる', async () => {
    const { result } = renderWithUrl('/browse?group=symbol&include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    const labels = result.current.list.groups.map(g => g.label).sort()
    expect(labels).toEqual(['AMD', 'SPY'])
    for (const g of result.current.list.groups) {
      expect(g.aggregate.count).toBe(g.items.length)
    }
  })

  it('隠した未実行レシピ数は絞り込み後の集合から数える', async () => {
    // ?symbol=AMD だと AMD レシピ（実行済み）だけが残り、未実行のみの
    // Idle Recipe は絞り込みで既に落ちている。これを「トグルで隠した 1 件」と
    // 報告してはならない。全体から数える実装だと 1 になって落ちる。
    const { result } = renderWithUrl('/browse?symbol=AMD')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.hiddenUnrunRecipeCount).toBe(0)
  })
})
```

既存の `SAMPLE`（`Alpha` / `Bravo` / `Charlie`）はすべて別名・別銘柄・別時間軸なので、ロールアップ後も 3 レシピになる。既存テストは `sortKey` / `groupBy` / `selectedId` / `compareIds` / URL 往復しか見ておらず `filtered` も `groups` も参照していないため、そのまま通る。

`filtered` はこのタスクの後半（Step 14）で消費者がいなくなるので、そこで削除する。Step 5 の時点では `BrowseScreen` がまだ使っているため残す。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useStrategyList.test.tsx`
Expected: FAIL — `result.current.recipes` が `undefined`

- [ ] **Step 3: 実効銘柄を絞り込みと選択肢に適用する**

`frontend/src/hooks/useStrategyList.ts` を編集する。冒頭に import を追加する。

```ts
import { buildRecipes, effectiveSymbol, type Recipe } from '../lib/recipes'
```

`useStrategyData` の `symbols` を実効銘柄ベースに変える。

```ts
  const symbols = useMemo(
    () => [...new Set(all.map(effectiveSymbol).filter((s): s is string => Boolean(s)))].sort(),
    [all],
  )
```

`useFiltering` の銘柄参照を 2 箇所とも実効銘柄に変える。

```ts
function useFiltering(
  all: StrategyListItem[],
  q: string,
  symbolFilter: string[],
  tfFilter: string[],
  sharpeMin: number,
  ddMax: number,
): StrategyListItem[] {
  return useMemo(() => {
    const needle = q.toLowerCase()
    return all.filter(s => {
      // 銘柄は実効銘柄で判定する。item.symbol だけを見ると、定義のみで
      // 銘柄が判明している戦略はチップに出るのに選ぶと 0 件になる。
      const symbol = effectiveSymbol(s) ?? ''
      if (q && !s.name.toLowerCase().includes(needle) && !symbol.toLowerCase().includes(needle)) return false
      if (symbolFilter.length > 0 && !symbolFilter.includes(symbol)) return false
      if (tfFilter.length > 0 && !tfFilter.includes(s.timeframe ?? '')) return false
      if (!isNaN(sharpeMin) && numVal(s.latest_sharpe) < sharpeMin) return false
      if (!isNaN(ddMax) && Math.abs(numVal(s.latest_max_drawdown_pct)) > ddMax) return false
      return true
    })
  }, [all, q, symbolFilter, tfFilter, sharpeMin, ddMax])
}
```

- [ ] **Step 4: レシピのソートとグループ化に差し替える**

同ファイルの `useSortedItems` を `useSortedRecipes` に置き換える。`SortKey` はこのファイルで定義されているのでここに置く（`lib/recipes.ts` へ移すと循環 import になる）。

```ts
/** レシピを best の指標で並べる。best が無いレシピは常に末尾に沈む。 */
function useSortedRecipes(
  recipes: Recipe[],
  sortKey: SortKey,
  sortDir: SortDir,
): Recipe[] {
  return useMemo(() => {
    return [...recipes].sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'name') {
        va = a.name
        vb = b.name
      } else if (sortKey === 'last_run_at') {
        va = a.best?.last_run_at ?? ''
        vb = b.best?.last_run_at ?? ''
      } else {
        va = numVal(a.best?.[sortKey] as number | null | undefined)
        vb = numVal(b.best?.[sortKey] as number | null | undefined)
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [recipes, sortKey, sortDir])
}
```

`numVal` は `null` のみを受ける現在の実装を `undefined` も受けるように広げる。

```ts
function numVal(v: number | null | undefined): number {
  return v ?? -Infinity
}
```

`aggregate` と `buildGroups` をレシピ向けに変える。

```ts
function aggregate(recipes: Recipe[]): GroupAggregate {
  let bestSharpe: number | null = null
  let worstDd: number | null = null
  for (const r of recipes) {
    const sharpe = r.best?.latest_sharpe
    if (sharpe != null) {
      bestSharpe = bestSharpe == null ? sharpe : Math.max(bestSharpe, sharpe)
    }
    const dd = r.best?.latest_max_drawdown_pct
    if (dd != null) {
      worstDd = worstDd == null ? dd : Math.min(worstDd, dd)
    }
  }
  return { count: recipes.length, bestSharpe, worstDrawdownPct: worstDd }
}

function buildGroups(recipes: Recipe[], groupBy: GroupBy): StrategyGroup[] {
  if (groupBy === 'none') {
    if (recipes.length === 0) return []
    return [{ key: 'all', label: 'all', rank: 0, items: recipes, aggregate: aggregate(recipes) }]
  }

  if (groupBy === 'tier') {
    const buckets: Record<TierKey, Recipe[]> = {
      strong: [], moderate: [], weak: [], no_data: [],
    }
    for (const r of recipes) {
      buckets[sharpeTierKey(r.best?.latest_sharpe)].push(r)
    }
    const out: StrategyGroup[] = []
    for (const tierKey of Object.keys(buckets) as TierKey[]) {
      const tierItems = buckets[tierKey]
      if (tierItems.length === 0) continue
      out.push({
        key: `tier:${tierKey}`,
        label: TIER_LABEL[tierKey],
        rank: TIER_RANK[tierKey],
        items: tierItems,
        aggregate: aggregate(tierItems),
      })
    }
    return out.sort((a, b) => a.rank - b.rank)
  }

  // groupBy: 'symbol' | 'tf'
  const keyOf = (r: Recipe): string =>
    groupBy === 'symbol' ? (r.symbol ?? '') : (r.timeframe ?? '')

  const map = new Map<string, Recipe[]>()
  for (const r of recipes) {
    const k = keyOf(r)
    const arr = map.get(k)
    if (arr) arr.push(r)
    else map.set(k, [r])
  }
  const out: StrategyGroup[] = []
  for (const [k, groupItems] of map.entries()) {
    const isUnassigned = !k
    out.push({
      key: `${groupBy}:${k || '_unassigned'}`,
      label: isUnassigned ? 'Unassigned' : k,
      rank: isUnassigned ? Number.POSITIVE_INFINITY : 0,
      items: groupItems,
      aggregate: aggregate(groupItems),
    })
  }
  return out.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.aggregate.count !== b.aggregate.count) return b.aggregate.count - a.aggregate.count
    return a.label.localeCompare(b.label)
  })
}
```

`StrategyGroup` の型を変える。

```ts
export interface StrategyGroup {
  key: string
  label: string
  rank: number
  items: Recipe[]
  aggregate: GroupAggregate
}
```

`sharpeTierKey` の引数を `number | null | undefined` に広げる。

```ts
function sharpeTierKey(v: number | null | undefined): TierKey {
  if (v == null) return 'no_data'
  if (v >= 1.5) return 'strong'
  if (v >= 1.0) return 'moderate'
  return 'weak'
}
```

- [ ] **Step 5: `include_unrun` とパイプラインを組む**

`VALID_GROUP_BY` の下に URL 変換を追加する。

```ts
function toIncludeUnrun(v: string | null): boolean {
  return v === '1'
}
```

`StrategyListState` に追加する。

```ts
export interface StrategyListState {
  all: StrategyListItem[]
  filtered: StrategyListItem[]
  /** 絞り込み・未実行除外・ソートを通したレシピ（表の描画対象） */
  recipes: Recipe[]
  /** 全戦略から作ったレシピ数。フィルタに依らない分母 */
  recipeTotal: number
  /** 未実行トグルで隠れているレシピ数。includeUnrun が true なら 0 */
  hiddenUnrunRecipeCount: number
  includeUnrun: boolean
  groups: StrategyGroup[]
  loading: boolean
  error: string | null
  sortKey: SortKey
  sortDir: SortDir
  setSort: (key: SortKey) => void
  groupBy: GroupBy
  setGroupBy: (g: GroupBy) => void
  symbols: string[]
  timeframes: string[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  compareIds: string[]
  toggleCompareId: (id: string) => void
  removeCompareId: (id: string) => void
  clearCompareIds: () => void
}
```

`useStrategyList` 本体を組み替える。

```ts
export function useStrategyList(): StrategyListState {
  const [searchParams, setSearchParams] = useSearchParams()
  const { all, loading, error, symbols, timeframes } = useStrategyData()

  const sortKey = toSortKey(searchParams.get('sort'))
  const sortDir = toSortDir(searchParams.get('dir'))
  const groupBy = toGroupBy(searchParams.get('group'))
  const includeUnrun = toIncludeUnrun(searchParams.get('include_unrun'))
  const q = searchParams.get('q') ?? ''
  const symbolFilter = useMemo(
    () => (searchParams.get('symbol') ?? '').split(',').filter(Boolean),
    [searchParams],
  )
  const tfFilter = useMemo(
    () => (searchParams.get('tf') ?? '').split(',').filter(Boolean),
    [searchParams],
  )
  const sharpeMin = parseFloat(searchParams.get('sharpe_min') ?? '')
  const ddMax = parseFloat(searchParams.get('dd_max') ?? '')

  const filtered = useFiltering(all, q, symbolFilter, tfFilter, sharpeMin, ddMax)

  // 絞り込み後の戦略をレシピへ畳む。未実行トグルはこのあとに効かせる。
  const filteredRecipes = useMemo(() => buildRecipes(filtered), [filtered])

  // 「隠した件数」は絞り込み後の集合に対して数える。全体から数えると、
  // フィルタで既に落ちているレシピまで「トグルで隠した」と報告してしまう。
  const unrunOnlyCount = useMemo(
    () => filteredRecipes.filter(r => r.runCount === 0).length,
    [filteredRecipes],
  )
  const visibleRecipes = useMemo(
    () => (includeUnrun ? filteredRecipes : filteredRecipes.filter(r => r.runCount > 0)),
    [filteredRecipes, includeUnrun],
  )

  const recipes = useSortedRecipes(visibleRecipes, sortKey, sortDir)
  const groups = useGrouping(recipes, groupBy)

  // 分母はフィルタに依らない全体のレシピ数
  const recipeTotal = useMemo(() => buildRecipes(all).length, [all])
  ...
```

戻り値に追加する。

```ts
  return {
    all, filtered, recipes, recipeTotal,
    hiddenUnrunRecipeCount: includeUnrun ? 0 : unrunOnlyCount,
    includeUnrun,
    groups, loading, error,
    sortKey, sortDir, setSort,
    groupBy, setGroupBy,
    symbols, timeframes,
    selectedId, setSelectedId,
    ...compare,
  }
```

`useGrouping` の引数型を `Recipe[]` に変える。

```ts
function useGrouping(recipes: Recipe[], groupBy: GroupBy): StrategyGroup[] {
  return useMemo(() => buildGroups(recipes, groupBy), [recipes, groupBy])
}
```

- [ ] **Step 6: 失敗するテストを書く**

`frontend/src/components/browser/__tests__/RecipeRow.test.tsx` を新規作成する。

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { buildRecipes } from '../../../lib/recipes'
import { RecipeRow } from '../RecipeRow'

function mkItem(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
    strategy_id: overrides.strategy_id,
    name: 'AMD EMA+ SuperTrend Trend Following v1',
    symbol: 'AMD',
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

/** 3 試行のうち 1 件だけ実行済み（実データの AMD が 15 試行中 1 件実行）。 */
function threeVariantRecipe() {
  const items = [
    mkItem({ strategy_id: 'amd_v1', latest_sharpe: 0.76, latest_return_pct: 12.4, latest_max_drawdown_pct: -18.2, last_run_at: '2026-04-13T00:00:00' }),
    mkItem({ strategy_id: 'amd_v2' }),
    mkItem({ strategy_id: 'amd_v3' }),
  ]
  return buildRecipes(items)[0]
}

function renderRecipe(recipe = threeVariantRecipe(), expanded = false, onToggleExpand = vi.fn()) {
  render(
    <MemoryRouter>
      <table><tbody>
        <RecipeRow
          recipe={recipe}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          selectedId={null}
          onSelect={vi.fn()}
          compareIds={[]}
          onToggleCompare={vi.fn()}
          onHover={vi.fn()}
          sparkValues={undefined}
          lang="ja"
        />
      </tbody></table>
    </MemoryRouter>,
  )
  return { onToggleExpand }
}

describe('<RecipeRow />', () => {
  it('試行数と実行済み数を出す', () => {
    renderRecipe()
    expect(screen.getByText(/3 試行中 1 件実行/)).toBeInTheDocument()
  })

  it('指標は best 1 件の値で、列ごとの最大を混ぜない', () => {
    // best は Sharpe 最大の v1。リターンが大きい v2 の値を拾ってはならない。
    const recipe = buildRecipes([
      mkItem({ strategy_id: 'v1', latest_sharpe: 1.5, latest_return_pct: 10.0, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'v2', latest_sharpe: 0.5, latest_return_pct: 99.0, last_run_at: '2026-01-02T00:00:00' }),
    ])[0]
    renderRecipe(recipe)
    expect(screen.getByText('1.50')).toBeInTheDocument()
    expect(screen.getByText('10.0%')).toBeInTheDocument()
    expect(screen.queryByText('99.0%')).toBeNull()
  })

  it('試行が 1 件だけなら展開トグルを出さない', () => {
    const recipe = buildRecipes([
      mkItem({ strategy_id: 'only', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
    ])[0]
    renderRecipe(recipe)
    expect(screen.queryByRole('button', { name: /試行を展開|Expand/ })).toBeNull()
  })

  it('展開トグルを押すとキーを渡して呼び返す', async () => {
    const { onToggleExpand } = renderRecipe()
    const toggle = screen.getByRole('button', { name: /試行を展開/ })
    toggle.click()
    expect(onToggleExpand).toHaveBeenCalledWith(threeVariantRecipe().key)
  })

  it('展開中は aria-expanded が true になる', () => {
    renderRecipe(threeVariantRecipe(), true)
    expect(screen.getByRole('button', { name: /試行を畳む/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('名前リンクは best の詳細画面へ向く', () => {
    renderRecipe()
    const link = screen.getByRole('link', { name: /AMD EMA/ })
    expect(link.getAttribute('href')).toBe('/detail/amd_v1')
  })

  it('全 variant が未実行なら比較チェックボックスを無効にする', () => {
    // 指標が無いので比較しても意味が無い
    const recipe = buildRecipes([
      mkItem({ strategy_id: 'a' }),
      mkItem({ strategy_id: 'b' }),
    ])[0]
    renderRecipe(recipe)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('全 variant が未実行なら名前リンクは先頭 variant へ向く', () => {
    const recipe = buildRecipes([
      mkItem({ strategy_id: 'a' }),
      mkItem({ strategy_id: 'b' }),
    ])[0]
    renderRecipe(recipe)
    const link = screen.getByRole('link', { name: /AMD EMA/ })
    expect(link.getAttribute('href')).toBe(`/detail/${recipe.variants[0].strategy_id}`)
  })
})
```

- [ ] **Step 7: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/RecipeRow.test.tsx`
Expected: FAIL — `Failed to resolve import "../RecipeRow"`

- [ ] **Step 8: `RecipeRow.tsx` を実装する**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Recipe } from '../../lib/recipes'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Chip } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { fmtNumber, fmtDate } from '../../lib/format'
import { COMPARE_MAX } from '../../hooks/useStrategyList'
import { TD_BASE, sharpeTone } from './StrategyRow'

export interface RecipeRowProps {
  recipe: Recipe
  expanded: boolean
  onToggleExpand: (key: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  onHover: (id: string | null) => void
  sparkValues: number[] | 'loading' | 'empty' | undefined
  lang: Lang
}

export function RecipeRow({
  recipe,
  expanded,
  onToggleExpand,
  selectedId,
  onSelect,
  compareIds,
  onToggleCompare,
  onHover,
  sparkValues,
  lang,
}: RecipeRowProps): React.ReactElement {
  const L = makeL(lang)
  const [isHovered, setHovered] = useState(false)

  // 行に出す指標はすべて best 1 件から取る。列ごとに最大を取ると実在しない
  // 戦略の成績を合成表示することになる。
  const best = recipe.best
  // best が無いのは全 variant 未実行のときだけ（Recipe の不変条件）。
  // その場合の遷移先は先頭 variant にする。
  const target = best ?? recipe.variants[0]
  const expandable = recipe.variantCount > 1
  const selected = best != null && selectedId === best.strategy_id
  const inCompare = best != null && compareIds.includes(best.strategy_id)
  const maxCompareReached = compareIds.length >= COMPARE_MAX && !inCompare

  const handleEnter = (): void => {
    setHovered(true)
    if (best) onHover(best.strategy_id)
  }

  const handleLeave = (): void => {
    setHovered(false)
    onHover(null)
  }

  const sparkRendered =
    Array.isArray(sparkValues) && sparkValues.length >= 2 ? (
      <Sparkline values={sparkValues} width={120} height={20} />
    ) : null

  return (
    <tr
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={() => { if (best) onSelect(best.strategy_id) }}
      style={{
        background: selected ? 'var(--accent-bg)' : isHovered ? 'var(--surface-2)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background var(--motion-fast)',
        cursor: best ? 'pointer' : 'default',
      }}
    >
      <td
        style={{ ...TD_BASE, textAlign: 'center', padding: '6px 4px', width: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={inCompare}
          disabled={best == null || maxCompareReached}
          aria-label={L(`${recipe.name} を比較に追加`, `Add ${recipe.name} to compare`)}
          onChange={() => { if (best) onToggleCompare(best.strategy_id) }}
          style={{
            cursor: best == null || maxCompareReached ? 'not-allowed' : 'pointer',
            accentColor: 'var(--accent)',
          }}
        />
      </td>
      <td style={{ ...TD_BASE, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {expandable ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? L(`${recipe.name} の試行を畳む`, `Collapse trials of ${recipe.name}`)
                  : L(`${recipe.name} の試行を展開`, `Expand trials of ${recipe.name}`)
              }
              onClick={(e) => { e.stopPropagation(); onToggleExpand(recipe.key) }}
              style={{
                flexShrink: 0,
                width: 20,
                background: 'transparent',
                border: 'none',
                color: 'var(--text2)',
                fontFamily: 'var(--mono)',
                cursor: 'pointer',
                padding: 0,
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform var(--motion-fast)',
              }}
            >
              ▾
            </button>
          ) : (
            <span aria-hidden style={{ flexShrink: 0, width: 20 }} />
          )}
          <Link
            to={`/detail/${target.strategy_id}`}
            title={recipe.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--serif)',
              fontSize: '1.0625rem',
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.005em',
              lineHeight: 1.2,
              textDecoration: 'none',
            }}
          >
            {recipe.name}
          </Link>
          {recipe.symbol ? <Chip>{recipe.symbol}</Chip> : null}
          {recipe.timeframe ? <Chip>{recipe.timeframe}</Chip> : null}
          {expandable && (
            <span
              style={{
                flexShrink: 0,
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {L(
                `${recipe.variantCount} 試行中 ${recipe.runCount} 件実行`,
                `${recipe.runCount} of ${recipe.variantCount} trials run`,
              )}
            </span>
          )}
        </div>
      </td>
      <td style={{ ...TD_BASE, color: sharpeTone(best?.latest_sharpe), fontWeight: 700, fontSize: '1rem' }}>
        {fmtNumber(best?.latest_sharpe, { decimals: 2 })}
      </td>
      <td
        style={{
          ...TD_BASE,
          color:
            best?.latest_return_pct == null
              ? 'var(--text3)'
              : best.latest_return_pct >= 0
                ? 'var(--success)'
                : 'var(--danger)',
        }}
      >
        {fmtNumber(best?.latest_return_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td style={{ ...TD_BASE, color: best?.latest_max_drawdown_pct == null ? 'var(--text3)' : 'var(--danger)' }}>
        {fmtNumber(best?.latest_max_drawdown_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(best?.latest_profit_factor, { decimals: 2 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(best?.latest_win_rate_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, color: 'var(--text3)', fontSize: 'var(--fs-mono-sm)' }}
      >
        {fmtDate(best?.last_run_at)}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, padding: '6px 12px', width: 132, textAlign: 'right' }}
      >
        <div style={{ display: 'inline-flex', justifyContent: 'flex-end', minHeight: 20 }}>
          {sparkRendered}
        </div>
      </td>
    </tr>
  )
}
```

`fmtNumber` は `number | null | undefined` を受ける既存実装なので `best?.latest_sharpe` をそのまま渡してよい。渡せない場合は `?? null` を付ける。

- [ ] **Step 9: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/RecipeRow.test.tsx`
Expected: PASS（8 件）

- [ ] **Step 10: `StrategyTable` をレシピ対応にする**

`StrategyTable.tsx` の props と描画を差し替える。

```tsx
interface Props {
  recipes: Recipe[]
  /** 全戦略数。空状態の分岐（フィルタ由来 vs データ無し）に使う */
  strategyTotal: number
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  selectedId: string | null
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  lang: Lang
  groups?: StrategyGroup[]
  /** フッタに出す件数（Task 4 で `StrategyTableFooter` が使う） */
  recipeTotal: number
  hiddenUnrunRecipeCount: number
}
```

行の組み立てを差し替える。

```tsx
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())

  const toggleExpand = (key: string): void => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** レシピ 1 件を、折り畳み行＋（展開中なら）子行の配列にする。 */
  const renderRecipe = (recipe: Recipe): React.ReactElement[] => {
    const expanded = expandedKeys.has(recipe.key)
    const head = (
      <RecipeRow
        key={recipe.key}
        recipe={recipe}
        expanded={expanded}
        onToggleExpand={toggleExpand}
        selectedId={selectedId}
        onSelect={onSelect}
        compareIds={compareIds}
        onToggleCompare={onToggleCompare}
        onHover={setHoveredId}
        sparkValues={recipe.best ? sparkline.entries[recipe.best.strategy_id] : undefined}
        lang={lang}
      />
    )
    if (!expanded) return [head]
    const children = recipe.variants.map(v => {
      const inCompare = compareIds.includes(v.strategy_id)
      return (
        <StrategyRow
          key={v.strategy_id}
          s={v}
          selected={selectedId === v.strategy_id}
          inCompare={inCompare}
          maxCompareReached={compareIds.length >= COMPARE_MAX && !inCompare}
          onSelect={onSelect}
          onToggleCompare={onToggleCompare}
          onHover={setHoveredId}
          sparkValues={sparkline.entries[v.strategy_id]}
          lang={lang}
          indent
        />
      )
    })
    return [head, ...children]
  }
```

`tbody` の中身。

```tsx
        <tbody>
          {renderGroups
            ? renderGroups.flatMap(group => {
                const isCollapsed = collapsedKeys.has(group.key)
                const header = (
                  <GroupHeaderRow
                    key={`__header__${group.key}`}
                    group={group}
                    collapsed={isCollapsed}
                    onToggle={toggleGroup}
                    lang={lang}
                  />
                )
                if (isCollapsed) return [header]
                return [header, ...group.items.flatMap(renderRecipe)]
              })
            : recipes.flatMap(renderRecipe)}
          {/* 既存の空状態 <tr> をそのまま残す（下記 2 箇所のみ書き換え） */}
        </tbody>
```

既存の空状態の `<tr>` はブロックごと残す。編集は 2 箇所だけ。

1. `{items.length === 0 && (` を `{recipes.length === 0 && (` に変える
2. 空状態内の分岐 `{total > 0 ? (` を `{strategyTotal > 0 ? (` に変える

`colSpan={COL_COUNT}` は列数が 9 のまま変わらないので触らない。オンボーディング CTA の文言・URL・`utm_medium=empty_state` も変更しない（`StrategyTable.test.tsx` がこれらを固定している）。

既存フッタ（`${items.length}件 / 全${total}件`）は Task 4 で `StrategyTableFooter` に置き換える。このタスクでは件数だけ差し替えた暫定表示にしておく。

```tsx
      <div
        style={{
          padding: '12px 24px',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-mono)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {L(
          `${recipes.length} レシピ / 全 ${recipeTotal} レシピ`,
          `${recipes.length} of ${recipeTotal} recipes`,
        )}
      </div>
```

- [ ] **Step 11: `BrowseScreen` の props を差し替える**

```tsx
          <StrategyTable
            recipes={list.recipes}
            groups={list.groups}
            strategyTotal={list.all.length}
            recipeTotal={list.recipeTotal}
            hiddenUnrunRecipeCount={list.hiddenUnrunRecipeCount}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.setSort}
            selectedId={list.selectedId}
            onSelect={onSelect}
            compareIds={list.compareIds}
            onToggleCompare={list.toggleCompareId}
            lang={lang}
          />
```

- [ ] **Step 12: 既存の StrategyTable テストを props 変更に追随させる**

`StrategyTable.test.tsx` の `renderTable` を書き換える。テストの意図（空状態の 2 分岐）は変えない。

```tsx
function renderTable(strategyTotal: number) {
  render(
    <MemoryRouter>
      <StrategyTable
        recipes={[]}
        strategyTotal={strategyTotal}
        recipeTotal={0}
        hiddenUnrunRecipeCount={0}
        sortKey="latest_sharpe"
        sortDir="desc"
        onSort={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
        compareIds={[]}
        onToggleCompare={vi.fn()}
        lang="ja"
      />
    </MemoryRouter>,
  )
}
```

既存ファイルが `MemoryRouter` で包んでいなければ包む（`Link` を含むため必要）。

- [ ] **Step 13: 展開の統合テストを追記する**

まず Step 7 で書いた `renderTable` を recipes も受けられるように一般化する。

```tsx
function renderTable(strategyTotal: number, recipes: Recipe[] = []) {
  render(
    <MemoryRouter>
      <StrategyTable
        recipes={recipes}
        strategyTotal={strategyTotal}
        recipeTotal={recipes.length}
        hiddenUnrunRecipeCount={0}
        sortKey="latest_sharpe"
        sortDir="desc"
        onSort={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
        compareIds={[]}
        onToggleCompare={vi.fn()}
        lang="ja"
      />
    </MemoryRouter>,
  )
}
```

そのうえで `StrategyTable.test.tsx` に展開のテストを追記する。

```tsx
describe('<StrategyTable /> レシピ展開', () => {
  it('折り畳み時は 1 行、展開すると variant の行が増える', async () => {
    const recipes = buildRecipes([
      mkItem({ strategy_id: 'v1', name: 'X', symbol: 'SPY', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'v2', name: 'X', symbol: 'SPY' }),
      mkItem({ strategy_id: 'v3', name: 'X', symbol: 'SPY' }),
    ])
    renderTable(3, recipes)

    // ヘッダー行 + レシピ 1 行
    expect(screen.getAllByRole('row')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /試行を展開/ }))
    // ヘッダー行 + レシピ 1 行 + variant 3 行
    expect(screen.getAllByRole('row')).toHaveLength(5)
    expect(screen.getByText('v2')).toBeInTheDocument()
  })
})
```

import を追加する。

```tsx
import userEvent from '@testing-library/user-event'
import { buildRecipes, type Recipe } from '../../../lib/recipes'
```

`mkItem` は Task 2 のテストと同じ形のファクトリをこのファイルにも置く。`@testing-library/user-event` は既に devDependencies にあり（`^14.6.1`）、`TabBar` / `ConfirmDialog` / `OverflowMenu` など 8 ファイルで使われているので、新しい依存は不要。

- [ ] **Step 14: 消費者のいなくなった `filtered` を落とす**

`StrategyTable` が `recipes` を受けるようになった時点で、`list.filtered` の消費者はゼロになる（`Heroline` と `SymbolAtlas` は `list.all` を受けており、`IdeasPage` の `list.filtered` は別 hook のもの）。公開された未使用フィールドを残さない。

`useStrategyList.ts` の `StrategyListState` から `filtered: StrategyListItem[]` を削除し、返り値からも外す。`useFiltering` の呼び出しは内部で必要なので残す（変数名は `filtered` のまま）。

```ts
  return {
    all, recipes, recipeTotal,
    hiddenUnrunRecipeCount: includeUnrun ? 0 : unrunOnlyCount,
    includeUnrun,
    groups, loading, error,
    sortKey, sortDir, setSort,
    groupBy, setGroupBy,
    symbols, timeframes,
    selectedId, setSelectedId,
    ...compare,
  }
```

SP2 のカバレッジモードで絞り込み後の戦略集合が必要になったら 1 行で戻せる。使う当てが無いうちは公開しない。

- [ ] **Step 15: 全テストと型チェック**

Run: `cd frontend && pnpm vitest run && pnpm run lint && pnpm run build`
Expected: すべて exit 0

型変更と追随が同じタスク内で完結するので、ここでビルドが通らなければ何かを取りこぼしている。
`Heroline` と `SymbolAtlas` は `items: StrategyListItem[]` を受け続けるので変更不要。

- [ ] **Step 16: コミット**

```bash
git add frontend/src/hooks/useStrategyList.ts \
        frontend/src/hooks/__tests__/useStrategyList.test.tsx \
        frontend/src/components/browser/RecipeRow.tsx \
        frontend/src/components/browser/StrategyTable.tsx \
        frontend/src/components/browser/__tests__/RecipeRow.test.tsx \
        frontend/src/components/browser/__tests__/StrategyTable.test.tsx \
        frontend/src/screens/BrowseScreen.tsx
git commit -m "feat(browse): 戦略一覧をレシピ単位に畳んで表に描く

絞り込み → ロールアップ → 未実行除外 → ソート → グループ化の順に流す。
ソートは best の指標で行い、best を持たないレシピは末尾へ沈む。

同名 15 件が 1 行に畳まれ、展開トグルで strategy_id 付きの子行が出る。

行に出す指標は best 1 件から取る。列ごとに最大を取ると実在しない戦略の
成績を合成表示することになるため、テストで固定した。

銘柄の判定を実効銘柄に統一した。選択肢の生成だけ実効銘柄にして絞り込みを
item.symbol のまま残すと、定義のみで銘柄が判明している戦略はチップに出る
のに選ぶと 0 件になる。

隠した未実行レシピ数は絞り込み後の集合に対して数える。全体から数えると
フィルタで既に落ちている分まで「トグルで隠した」と報告してしまう。

StrategyGroup.items の型変更と StrategyTable の追随を同じコミットに入れて
いる。分けるとビルド不能な中間コミットが履歴に残る。"
```

- [ ] **Step 17: ablation でテストの判別力を確認する**

コミット済みなので安全に壊せる。1 つずつ入れて対応するテストが落ちることを確認し、
毎回 `git checkout -- <該当ファイル>` で戻す。

| 退行のさせ方 | 落ちるべきテスト |
|---|---|
| `useFiltering` の銘柄判定を `s.symbol ?? ''` に戻す | 「銘柄フィルタが定義のみで判明する銘柄にも効く」 |
| `symbols` の生成を `all.map(s => s.symbol)` に戻す | 「銘柄の選択肢を実効銘柄から作る」 |
| `unrunOnlyCount` の集合を `filteredRecipes` から `buildRecipes(all)` に変える | 「隠した未実行レシピ数は絞り込み後の集合から数える」 |
| `useSortedRecipes` の指標参照を `a.best?.[sortKey]` から `a.variants[0][sortKey]` に変える | 「レシピを best の指標でソートする」 |
| `RecipeRow` のリターン列を `Math.max(...recipe.variants.map(v => v.latest_return_pct ?? -Infinity))` に変える | 「指標は best 1 件の値で、列ごとの最大を混ぜない」 |
| `expandable` を `recipe.variantCount >= 1` に変える | 「試行が 1 件だけなら展開トグルを出さない」 |
| 比較チェックボックスの `disabled` から `best == null` を外す | 「全 variant が未実行なら比較チェックボックスを無効にする」 |

Run（各退行ごとに）: `cd frontend && pnpm vitest run src/hooks/__tests__/useStrategyList.test.tsx src/components/browser/__tests__/RecipeRow.test.tsx`
Expected: 対応するテストが FAIL し、他は PASS のまま

7 つ確認したら `git status` で作業ツリーがクリーン（退行が残っていない）ことを確かめる。

---

### Task 4: `StrategyTableFooter.tsx` — 件数開示

**Files:**
- Create: `frontend/src/components/browser/StrategyTableFooter.tsx`
- Modify: `frontend/src/components/browser/StrategyTable.tsx`（暫定フッタを差し替え）
- Test: `frontend/src/components/browser/__tests__/StrategyTableFooter.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 3 の `recipeTotal` / `hiddenUnrunRecipeCount`
- Produces:
  ```ts
  export interface StrategyTableFooterProps {
    visibleRecipeCount: number
    recipeTotal: number
    hiddenUnrunRecipeCount: number
    strategyTotal: number
    lang: Lang
  }
  export function StrategyTableFooter(props: StrategyTableFooterProps): React.ReactElement
  ```

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StrategyTableFooter } from '../StrategyTableFooter'

describe('<StrategyTableFooter />', () => {
  it('未実行を隠しているときは隠した件数を明示する', () => {
    // 黙って 68% を切り落とすと「全部見えている」と誤読される
    render(
      <StrategyTableFooter
        visibleRecipeCount={136}
        recipeTotal={275}
        hiddenUnrunRecipeCount={139}
        strategyTotal={475}
        lang="ja"
      />,
    )
    const text = screen.getByTestId('strategy-table-footer').textContent ?? ''
    expect(text).toContain('136')
    expect(text).toContain('275')
    expect(text).toContain('139')
    expect(text).toContain('475')
    expect(text).toMatch(/非表示/)
  })

  it('何も隠していないときは非表示の文言を出さない', () => {
    render(
      <StrategyTableFooter
        visibleRecipeCount={275}
        recipeTotal={275}
        hiddenUnrunRecipeCount={0}
        strategyTotal={475}
        lang="ja"
      />,
    )
    const text = screen.getByTestId('strategy-table-footer').textContent ?? ''
    expect(text).not.toMatch(/非表示/)
    expect(text).toContain('275')
  })

  it('英語でも 4 つの件数をすべて出す', () => {
    render(
      <StrategyTableFooter
        visibleRecipeCount={136}
        recipeTotal={275}
        hiddenUnrunRecipeCount={139}
        strategyTotal={475}
        lang="en"
      />,
    )
    const text = screen.getByTestId('strategy-table-footer').textContent ?? ''
    for (const n of ['136', '275', '139', '475']) {
      expect(text).toContain(n)
    }
    expect(text).toMatch(/hidden/i)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/StrategyTableFooter.test.tsx`
Expected: FAIL — `Failed to resolve import "../StrategyTableFooter"`

- [ ] **Step 3: 実装する**

```tsx
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

export interface StrategyTableFooterProps {
  /** いま表の中に描画されているレシピ数 */
  visibleRecipeCount: number
  /** 全戦略から作ったレシピ数（フィルタ非依存の分母） */
  recipeTotal: number
  /** 未実行トグルで隠れているレシピ数。0 なら文言を出さない */
  hiddenUnrunRecipeCount: number
  strategyTotal: number
  lang: Lang
}

/**
 * 表示件数と、既定で除外している未実行レシピ数を開示する。
 *
 * 既定では未実行のみのレシピを表から外す（実データでは 275 レシピ中 139）。
 * 黙って切ると「全部見えている」と誤読されるため、隠した件数を常に出す。
 */
export function StrategyTableFooter({
  visibleRecipeCount,
  recipeTotal,
  hiddenUnrunRecipeCount,
  strategyTotal,
  lang,
}: StrategyTableFooterProps): React.ReactElement {
  const L = makeL(lang)
  const hidden =
    hiddenUnrunRecipeCount > 0
      ? L(
          `（未実行のみ ${hiddenUnrunRecipeCount} レシピを非表示）`,
          ` (${hiddenUnrunRecipeCount} unrun-only recipes hidden)`,
        )
      : ''
  return (
    <div
      data-testid="strategy-table-footer"
      style={{
        padding: '12px 24px',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        color: 'var(--text3)',
        letterSpacing: 'var(--tracking-mono)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {L(
        `${visibleRecipeCount} レシピ表示 / 全 ${recipeTotal} レシピ${hidden} · ${strategyTotal} 戦略`,
        `${visibleRecipeCount} of ${recipeTotal} recipes${hidden} · ${strategyTotal} strategies`,
      )}
    </div>
  )
}
```

元のフッタは `textTransform: 'uppercase'` を持っていたが、日本語と数字が混ざる文になったので外す。

- [ ] **Step 4: `StrategyTable` の暫定フッタを差し替える**

`StrategyTable.tsx` 末尾の `<div>` を削除して次に置き換える。

```tsx
      <StrategyTableFooter
        visibleRecipeCount={recipes.length}
        recipeTotal={recipeTotal}
        hiddenUnrunRecipeCount={hiddenUnrunRecipeCount}
        strategyTotal={strategyTotal}
        lang={lang}
      />
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser && pnpm run lint && pnpm run build`
Expected: すべて exit 0

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/browser/StrategyTableFooter.tsx \
        frontend/src/components/browser/StrategyTable.tsx \
        frontend/src/components/browser/__tests__/StrategyTableFooter.test.tsx
git commit -m "feat(browse): 表示件数と除外した未実行レシピ数を開示

既定で未実行のみのレシピを外す（実データでは 275 レシピ中 139）。黙って
切ると全部見えていると誤読されるため、隠した件数を常にフッタに出す。"
```

---

### Task 5: クローム圧縮

**Files:**
- Create: `frontend/src/components/browser/CollapsibleSection.tsx`
- Modify: `frontend/src/screens/BrowseScreen.tsx`
- Modify: `frontend/src/components/browser/FilterBar.tsx`
- Modify: `frontend/src/components/browser/SavedViews.tsx`
- Modify: `frontend/src/components/browser/Heroline.tsx`
- Modify: `frontend/src/hooks/useSymbolStats.ts`
- Test: `frontend/src/components/browser/__tests__/CollapsibleSection.test.tsx`（新規）、`frontend/src/components/browser/__tests__/FilterBar.test.tsx`（新規または既存に追記）

**Interfaces:**
- Consumes: Task 1 の `effectiveSymbol`
- Produces:
  ```ts
  export interface CollapsibleSectionProps {
    label: string
    defaultOpen?: boolean
    children: React.ReactNode
    testId?: string
  }
  export function CollapsibleSection(props: CollapsibleSectionProps): React.ReactElement
  ```

- [ ] **Step 1: `CollapsibleSection` の失敗するテストを書く**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CollapsibleSection } from '../CollapsibleSection'

describe('<CollapsibleSection />', () => {
  it('既定では中身を出さない', () => {
    render(
      <CollapsibleSection label="銘柄アトラス（46 銘柄）">
        <p>中身</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByText('中身')).toBeNull()
    expect(screen.getByRole('button', { name: /銘柄アトラス/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('クリックで開閉し aria-expanded が追随する', async () => {
    render(
      <CollapsibleSection label="銘柄アトラス（46 銘柄）">
        <p>中身</p>
      </CollapsibleSection>,
    )
    const toggle = screen.getByRole('button', { name: /銘柄アトラス/ })
    await userEvent.click(toggle)
    expect(screen.getByText('中身')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(screen.queryByText('中身')).toBeNull()
  })

  it('defaultOpen で開いた状態から始まる', () => {
    render(
      <CollapsibleSection label="銘柄" defaultOpen>
        <p>中身</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('中身')).toBeInTheDocument()
  })

  it('ラベルは件数を含められる（消えたと誤認させないため）', () => {
    render(
      <CollapsibleSection label="銘柄アトラス（46 銘柄）">
        <p>中身</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText(/46 銘柄/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/CollapsibleSection.test.tsx`
Expected: FAIL — `Failed to resolve import "../CollapsibleSection"`

- [ ] **Step 3: `CollapsibleSection` を実装する**

`screens/` は `useState` を持てない（ADR-0001）ため、開閉 state はこのコンポーネントが持つ。

```tsx
import { useId, useState } from 'react'

export interface CollapsibleSectionProps {
  /** トグルに出す見出し。件数を含めて「消えた」と誤認させないようにする */
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
  testId?: string
}

/**
 * 折り畳みセクション。開閉 state を自前で持つ。
 *
 * screens/ は useState を持てない（frontend/CLAUDE.md / ADR-0001）ため、
 * BrowseScreen から使う折り畳みはこのコンポーネント側に state を置く。
 */
export function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
  testId,
}: CollapsibleSectionProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          width: '100%',
          padding: 'var(--space-3) var(--layout-gutter)',
          background: 'var(--bg)',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text2)',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 600,
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 14,
            fontFamily: 'var(--mono)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform var(--motion-fast)',
          }}
        >
          ▾
        </span>
        {label}
      </button>
      {open && <div id={contentId}>{children}</div>}
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/CollapsibleSection.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 5: `FilterBar` の失敗するテストを書く**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FilterBar } from '../FilterBar'

const SYMBOLS = ['AAPL', 'AMD', 'SPY', 'QQQ']

function renderBar(initialEntry = '/browse') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FilterBar symbols={SYMBOLS} timeframes={['1d', '1h']} lang="ja" />
    </MemoryRouter>,
  )
}

describe('<FilterBar /> 銘柄チップの折り畳み', () => {
  it('既定では銘柄チップを畳み、件数をラベルに出す', () => {
    // 実データでは 46 銘柄が 3 段に折り返して 130px を占めていた
    renderBar()
    expect(screen.queryByRole('button', { name: 'AAPL' })).toBeNull()
    expect(screen.getByRole('button', { name: /銘柄で絞る（4）/ })).toBeInTheDocument()
  })

  it('展開すると銘柄チップが出る', async () => {
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: /銘柄で絞る（4）/ }))
    expect(screen.getByRole('button', { name: 'AAPL' })).toBeInTheDocument()
  })

  it('銘柄が選択済みなら最初から展開する', () => {
    // 選択が見えないまま絞られている状態を作らない
    renderBar('/browse?symbol=SPY')
    expect(screen.getByRole('button', { name: 'SPY' })).toBeInTheDocument()
  })
})

describe('<FilterBar /> 未実行トグル', () => {
  it('既定では未チェック', () => {
    renderBar()
    expect(screen.getByRole('checkbox', { name: /未実行を含める/ })).not.toBeChecked()
  })

  it('include_unrun=1 ならチェック済み', () => {
    renderBar('/browse?include_unrun=1')
    expect(screen.getByRole('checkbox', { name: /未実行を含める/ })).toBeChecked()
  })
})
```

- [ ] **Step 6: テストが失敗することを確認する**

Run: `cd frontend && pnpm vitest run src/components/browser/__tests__/FilterBar.test.tsx`
Expected: FAIL — 銘柄チップが最初から描画されている / 未実行チェックボックスが存在しない

- [ ] **Step 7: `FilterBar` を実装する**

銘柄チップのブロックを `CollapsibleSection` で包む。`symbols.length` をラベルに入れる。`defaultOpen` は `symbolFilter.length > 0`。

```tsx
      {symbols.length > 0 && (
        <CollapsibleSection
          label={L(`銘柄で絞る（${symbols.length}）`, `Filter by symbol (${symbols.length})`)}
          defaultOpen={symbolFilter.length > 0}
          testId="symbol-filter-collapsible"
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 'var(--space-2) 0' }}>
            {symbols.map(s => (
              <FilterChipButton
                key={s}
                active={symbolFilter.includes(s)}
                onClick={() => toggle('symbol', s)}
              >
                {s}
              </FilterChipButton>
            ))}
          </div>
        </CollapsibleSection>
      )}
```

未実行トグルを追加する。`include_unrun` は他のフィルタと同じく URL param に書く。

```tsx
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text2)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={includeUnrun}
          onChange={(e) => set('include_unrun', e.target.checked ? '1' : '')}
          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        {L('未実行を含める', 'Include unrun')}
      </label>
```

`includeUnrun` の読み出しと `hasFilters` への反映。

```tsx
  const includeUnrun = searchParams.get('include_unrun') === '1'

  const hasFilters =
    q || symbolFilter.length > 0 || tfFilter.length > 0 || sharpeMin || ddMax || includeUnrun
```

`Toolbar` は横並びの 1 段なので、`CollapsibleSection` を中に入れると幅を取り過ぎる。`FilterBar` の返り値を「`Toolbar`（検索・時間軸・数値・未実行トグル）＋ その下に銘柄の `CollapsibleSection`」の 2 要素に分け、`<>...</>` で返す。

- [ ] **Step 8: `SavedViews` の `FILTER_KEYS` に `include_unrun` を追加する**

```tsx
const FILTER_KEYS = ['q', 'symbol', 'tf', 'sharpe_min', 'dd_max', 'include_unrun', 'sort', 'dir', 'selected', 'compare'] as const
```

これを忘れると、未実行トグルを入れたままレンズを押しても解除されず「すべて」の active 判定も壊れる。

- [ ] **Step 9: `Heroline` と `useSymbolStats` を実効銘柄に統一する**

`Heroline.tsx` の `computeMetrics`:

```ts
import { effectiveSymbol } from '../../lib/recipes'
...
  for (const s of items) {
    // 実効銘柄で数える。item.symbol だけだと未実行分が落ちて、
    // 銘柄フィルタの選択肢数（46）と食い違う（35 になる）。
    const symbol = effectiveSymbol(s)
    if (symbol) symbolSet.add(symbol)
```

`Heroline` のレイアウトを横一列に詰める。`marginTop` / `paddingTop` を `var(--space-3)` へ、`gap` を `var(--space-5)` へ、`Stat` の `size` を `lg` から `md` へ変える。

`useSymbolStats.ts` の分類も実効銘柄にする。

```ts
    for (const s of items) {
      const symbol = effectiveSymbol(s)
      if (symbol == null) {
        unassigned.push(s)
      } else {
        const arr = buckets.get(symbol)
        if (arr) arr.push(s)
        else buckets.set(symbol, [s])
      }
    }
```

- [ ] **Step 10: `BrowseScreen` のヒーローを圧縮しアトラスを畳む**

説明文の `<p>` を丸ごと削除する。初回利用者向けの案内は `StrategyTable` の空状態が担っているので情報は失われない。

h1 の `fontSize` を `var(--hero-fs-h1)` から `1.5rem` へ、`margin` を `'6px 0 0 0'` から `'4px 0 0 0'` へ変える。

`header` の `padding` を `'var(--layout-gutter-y) var(--layout-gutter) var(--space-5)'` から `'var(--space-4) var(--layout-gutter)'` へ変える。

`SymbolAtlas` を `CollapsibleSection` で包む。ラベルに銘柄数を出す。

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

- [ ] **Step 11: 全テストと型チェック**

Run: `cd frontend && pnpm vitest run && pnpm run lint && pnpm run build`
Expected: すべて exit 0

`BrowseScreen` を import している単体テストは存在しない（`src/` 内で `BrowseScreen` を参照するのは `BrowsePage.tsx` のみ）ため、説明文の削除で落ちる単体テストは無い。ビジュアル回帰（`playwright.visual.config.ts` / `e2e/visual/tv-charts.spec.ts`）も TV チャート専用でブラウズ画面のベースラインを持たない。

それでも何かが落ちた場合は、落ちた assertion を消して済ませてはならない。何を守っていた assertion なのかを確認し、等価な検証に置き換える。

- [ ] **Step 12: コミット**

```bash
git add frontend/src/components/browser/CollapsibleSection.tsx \
        frontend/src/components/browser/__tests__/CollapsibleSection.test.tsx \
        frontend/src/components/browser/__tests__/FilterBar.test.tsx \
        frontend/src/components/browser/FilterBar.tsx \
        frontend/src/components/browser/SavedViews.tsx \
        frontend/src/components/browser/Heroline.tsx \
        frontend/src/hooks/useSymbolStats.ts \
        frontend/src/screens/BrowseScreen.tsx
git commit -m "feat(browse): 表に到達するまでのクロームを圧縮

実データで表の 1 行目までに 2,657px のスクロールが必要だった。内訳は
銘柄アトラス 1,999px・ヒーロー 346px・FilterBar 160px。

銘柄アトラスと銘柄チップを折り畳みにした。削除ではなく折り畳みなので
機能は残る。消えたと誤認されないようラベルに件数を出す。

ヒーローの説明文は削除した。初回利用者向けの案内は表の空状態が担っている
ため情報は失われない。

銘柄の判定を Heroline と useSymbolStats でも実効銘柄に統一した。選択肢
（46）と食い違う 35 が表示されていた。"
```

---

### Task 6: E2E fixture 拡張と E2E テスト

**Files:**
- Modify: `tests/fixtures/build_e2e_fixture.py`
- Modify: `frontend/e2e/specs/browse.spec.ts`

**Interfaces:**
- Consumes: Task 3 / 4 / 5 の UI
- Produces: 拡張された `frontend/e2e/fixtures/forge/`（`data/strategies/*.json` と `data/results/backtest_results.db`）

現行 fixture は 3 戦略（`sma_cross` / `rsi_reversal` / `momo_breakout`、すべて `target_symbols: ["SPY"]` / `1d`）でロールアップを検証できない。次を追加する。

| 追加する戦略 | 目的 |
|---|---|
| `ema_trend_v1` / `ema_trend_v2` / `ema_trend_v3`（同名 `EMA Trend Following`・SPY・1d、v1 と v2 は実行済み・v3 は未実行） | 3 試行 1 レシピ。展開と「3 試行中 2 件実行」 |
| `idle_recipe_v1` / `idle_recipe_v2`（同名 `Idle Recipe`・QQQ・1d、両方未実行） | 全 variant 未実行のレシピ。既定で非表示・トグルで出る |
| `dual_symbol_spy` / `dual_symbol_qqq`（同名 `Dual Symbol Recipe`、それぞれ SPY / QQQ、両方実行済み） | 同名でも銘柄が違えば別レシピになることを画面で確認 |
| `no_symbol_v1`（`target_symbols: []`・未実行） | 銘柄がどこからも判明しない場合の「未割当」表示 |

追加後の期待値:

- 全戦略数 = 3（既存）+ 3 + 2 + 2 + 1 = **11**
- レシピ数 = 3（既存は全て別名）+ 1 + 1 + 2 + 1 = **8**
- 実行実績があるレシピ = 3 + 1 + 0 + 2 + 0 = **6**
- 未実行のみのレシピ = **2**（`Idle Recipe` と `no_symbol_v1`）

- [ ] **Step 1: fixture の期待値を検証する E2E テストを先に書く**

`frontend/e2e/specs/browse.spec.ts` を書き換える。既存の「slide panel が開閉できる」テストは残し、行数の期待値だけ更新する。

```ts
import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoBrowse } from '../helpers/locators'

test.describe('Browse スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('レシピ単位で表示され slide panel が開閉できる', async ({ page }) => {
    await gotoBrowse(page)

    const tableScroll = page.getByTestId('strategy-table-scroll')
    await expect(tableScroll).toBeVisible()

    // 11 戦略 → 8 レシピ。うち実行実績があるのは 6 で、既定は未実行のみを隠す
    const rows = tableScroll.locator('tbody tr')
    await expect(rows).toHaveCount(6)

    await rows.first().click()
    const panel = page.getByTestId('strategy-slide-panel')
    await expect(panel).toBeVisible()

    const closeBtn = panel.getByRole('button', { name: /閉じる|Close/ })
    if (await closeBtn.count()) {
      await closeBtn.first().click()
    } else {
      await rows.first().click()
    }
    await expect(panel).not.toBeVisible()
  })

  test('フッタが表示件数と隠した未実行レシピ数を出す', async ({ page }) => {
    await gotoBrowse(page)
    const footer = page.getByTestId('strategy-table-footer')
    await expect(footer).toContainText('6')
    await expect(footer).toContainText('8')
    await expect(footer).toContainText('2')
    await expect(footer).toContainText('11')
    await expect(footer).toContainText('非表示')
  })

  test('未実行を含めるとレシピが増える', async ({ page }) => {
    await gotoBrowse(page)
    const rows = page.getByTestId('strategy-table-scroll').locator('tbody tr')
    await expect(rows).toHaveCount(6)

    await page.getByRole('checkbox', { name: /未実行を含める/ }).check()
    await expect(rows).toHaveCount(8)
  })

  test('同名 3 試行が 1 行に畳まれ展開で個別戦略が出る', async ({ page }) => {
    await gotoBrowse(page)
    const rows = page.getByTestId('strategy-table-scroll').locator('tbody tr')

    // "EMA Trend Following" は 3 試行 1 レシピ
    await expect(page.getByText(/3 試行中 2 件実行/)).toBeVisible()

    await page.getByRole('button', { name: /EMA Trend Following の試行を展開/ }).click()
    // 6 レシピ + 展開した 3 variant
    await expect(rows).toHaveCount(9)
    await expect(page.getByText('ema_trend_v3')).toBeVisible()
  })

  test('同名でも銘柄が違えば別レシピになる', async ({ page }) => {
    await gotoBrowse(page)
    // "Dual Symbol Recipe" が SPY と QQQ で 2 行
    await expect(page.getByText('Dual Symbol Recipe')).toHaveCount(2)
  })

  test('銘柄アトラスは既定で畳まれている', async ({ page }) => {
    await gotoBrowse(page)
    const toggle = page.getByTestId('symbol-atlas-collapsible').getByRole('button')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('heading', { name: /銘柄アトラス|Symbol Atlas/ })).toHaveCount(0)

    await toggle.click()
    await expect(page.getByRole('heading', { name: /銘柄アトラス|Symbol Atlas/ })).toBeVisible()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && pnpm run build && pnpm exec playwright test e2e/specs/browse.spec.ts`

Expected: FAIL — 行数が 3 のまま（fixture が未拡張）

- [ ] **Step 3: fixture に戦略定義を追加する**

`tests/fixtures/build_e2e_fixture.py` の `_strategy_definition` に `target_symbols` と `timeframe` を上書きできる引数を足す。

```python
def _strategy_definition(
    strategy_id: str,
    name: str,
    params: dict[str, object],
    *,
    target_symbols: list[str] | None = None,
    timeframe: str = "1d",
) -> dict[str, object]:
    return {
        "strategy_id": strategy_id,
        "name": name,
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": timeframe,
        "tags": ["e2e-fixture"],
        "target_symbols": ["SPY"] if target_symbols is None else target_symbols,
        "parameters": params,
        "indicators": [
            {"name": "sma_fast", "type": "SMA", "params": {"period": 10}},
            {"name": "sma_slow", "type": "SMA", "params": {"period": 30}},
        ],
        "variables": [],
        "entry_conditions": {"long": "sma_fast > sma_slow"},
        "exit_conditions": {"long": "sma_fast < sma_slow"},
        "risk_management": {"stop_loss_pct": 5.0, "take_profit_pct": 15.0},
    }
```

`_write_strategies` に追加分を書く。ロールアップ検証用の戦略群であることをコメントで明示する。

```python
# ロールアップ検証用（issue: ブラウズ画面のレシピ・ロールアップ SP1）。
# 名前・銘柄・実行有無の組み合わせで、レシピの畳み方を画面で確認できるようにする。
ROLLUP_STRATEGIES: tuple[tuple[str, str, dict[str, object], list[str] | None], ...] = (
    # 同名 3 試行 = 1 レシピ（v1 / v2 は実行済み・v3 は未実行）
    ("ema_trend_v1", "EMA Trend Following", {"fast": 10, "slow": 30}, None),
    ("ema_trend_v2", "EMA Trend Following", {"fast": 12, "slow": 26}, None),
    ("ema_trend_v3", "EMA Trend Following", {"fast": 8, "slow": 40}, None),
    # 全 variant 未実行 = 既定で非表示になるレシピ
    ("idle_recipe_v1", "Idle Recipe", {"lookback": 5}, ["QQQ"]),
    ("idle_recipe_v2", "Idle Recipe", {"lookback": 9}, ["QQQ"]),
    # 同名・別銘柄 = 別レシピ（name だけを鍵にすると 1 行に潰れる）
    ("dual_symbol_spy", "Dual Symbol Recipe", {"n": 1}, ["SPY"]),
    ("dual_symbol_qqq", "Dual Symbol Recipe", {"n": 1}, ["QQQ"]),
    # 銘柄がどこからも判明しない = 「未割当」表示
    ("no_symbol_v1", "No Symbol Recipe", {"n": 1}, []),
)
```

`_write_strategies` の末尾に追記する。

```python
    for sid, name, params, targets in ROLLUP_STRATEGIES:
        payload = _strategy_definition(sid, name, params, target_symbols=targets)
        path = STRATEGIES_DIR / f"{sid}.json"
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
```

- [ ] **Step 4: fixture に backtest 行を追加する**

`_write_db` の `rows` に追記する。実行済みにするのは `ema_trend_v1` / `ema_trend_v2` / `dual_symbol_spy` / `dual_symbol_qqq` の 4 件のみ。`ema_trend_v2` の Sharpe が v1 より高くなるよう `drift` を大きくして、レシピの best が v2 になることを画面で確認できるようにする。

`_build_backtest_row` は `symbol` を `"SPY"` 固定なので、`symbol` を引数で受けられるようにする。

```python
def _build_backtest_row(
    strategy_id: str,
    seed: int,
    drift: float,
    volatility: float,
    run_at: str,
    symbol: str = "SPY",
) -> dict[str, object]:
```

戻り値の `"symbol": "SPY"` を `"symbol": symbol` に変える。

```python
    rows = [
        _build_backtest_row("sma_cross", seed=1, drift=0.0008, volatility=0.012, run_at="2024-04-01T10:00:00"),
        _build_backtest_row("rsi_reversal", seed=2, drift=0.0006, volatility=0.014, run_at="2024-04-02T10:00:00"),
        _build_backtest_row("momo_breakout", seed=3, drift=0.0010, volatility=0.018, run_at="2024-04-03T10:00:00"),
        # 同名 3 試行のうち 2 件だけ実行済み。drift を変えて v2 が best になるようにする
        _build_backtest_row("ema_trend_v1", seed=4, drift=0.0005, volatility=0.013, run_at="2024-04-04T10:00:00"),
        _build_backtest_row("ema_trend_v2", seed=5, drift=0.0014, volatility=0.013, run_at="2024-04-05T10:00:00"),
        # 同名・別銘柄。symbol を変えて別レシピになることを画面で確認する
        _build_backtest_row("dual_symbol_spy", seed=6, drift=0.0007, volatility=0.015, run_at="2024-04-06T10:00:00", symbol="SPY"),
        _build_backtest_row("dual_symbol_qqq", seed=7, drift=0.0009, volatility=0.015, run_at="2024-04-07T10:00:00", symbol="QQQ"),
    ]
```

- [ ] **Step 5: fixture を再生成して期待値を確認する**

Run: `uv run python tests/fixtures/build_e2e_fixture.py`
Expected: `[ok]` 行が出て、DB サイズが 1MB 未満

生成物の中身を機械的に確認する。

Run:
```bash
uv run python -c "
import json, sqlite3, pathlib, collections
d = pathlib.Path('frontend/e2e/fixtures/forge/data')
items = [json.loads(p.read_text()) for p in sorted((d/'strategies').glob('*.json'))]
ran = {r[0] for r in sqlite3.connect(d/'results/backtest_results.db').execute('select distinct strategy_id from backtest_results')}
def eff(x):
    ts = x.get('target_symbols') or []
    return ts[0] if ts else None
rec = collections.defaultdict(list)
for x in items:
    rec[(x['name'], eff(x), x.get('timeframe'))].append(x['strategy_id'])
run_rec = {k: v for k, v in rec.items() if any(s in ran for s in v)}
print('戦略数', len(items))
print('レシピ数', len(rec))
print('実行実績ありのレシピ', len(run_rec))
print('未実行のみのレシピ', len(rec) - len(run_rec))
"
```
Expected: `戦略数 11` / `レシピ数 8` / `実行実績ありのレシピ 6` / `未実行のみのレシピ 2`

期待値と違ったら fixture を直す。E2E の期待値を実測値に合わせて書き換えて済ませてはならない（何を検証しているか分からなくなる）。

なお、この確認スクリプトの `eff` は定義側の `target_symbols` のみを見る簡易版で、フロントの `effectiveSymbol`（実行済みなら実際の `symbol` を優先）とは異なる。fixture では `dual_symbol_*` の `target_symbols` と backtest 行の `symbol` を一致させてあるので、どちらで数えても同じレシピ数になる。

- [ ] **Step 6: E2E が通ることを確認する**

Run: `cd frontend && pnpm run build && pnpm exec playwright test e2e/specs/browse.spec.ts`
Expected: PASS（6 件）

他の E2E spec が戦略数の増加で壊れていないかも確認する。

Run: `cd frontend && pnpm run e2e`
Expected: 全 PASS。`i18n.spec.ts` / `sample-fixture.spec.ts` が件数に依存していれば更新する

- [ ] **Step 7: Python 側のテストと Lint**

Run: `uv run pytest tests/ -q && uv run ruff check src/ tests/`
Expected: どちらも exit 0

fixture のバイナリ比較 CI（`scripts/compare_sqlite_dump.py`）がある場合は、fixture 再生成後の差分が想定どおりか確認する。

- [ ] **Step 8: コミット**

```bash
git add tests/fixtures/build_e2e_fixture.py \
        frontend/e2e/fixtures/forge \
        frontend/e2e/specs/browse.spec.ts
git commit -m "test(browse): E2E fixture にロールアップ検証用の戦略を追加

現行 fixture は 3 戦略すべて別名・同銘柄でロールアップを検証できなかった。
同名 3 試行（2 件実行済み）・全未実行レシピ・同名別銘柄・銘柄未設定を追加
し、11 戦略 8 レシピ（実行実績あり 6・未実行のみ 2）にした。

E2E で展開・件数開示・未実行トグル・同名別銘柄の分離・アトラスの折り畳みを
固定した。"
```

---

### Task 7: 実データ検証・スクリーンショット再撮影・最終ゲート

**Files:**
- Modify: `docs/screenshots/ja/browse.png`
- Modify: `docs/screenshots/en/browse.png`

**Interfaces:**
- Consumes: Task 1〜6 のすべて

- [ ] **Step 1: 実データでサーバーを起動する**

Run:
```bash
cd frontend && pnpm run build && cd .. && \
uv run alpha-vis serve --forge-dir /Users/sakae/dev/alpha-trade/alpha-strategies --port 8899 --no-open
```

別シェルで `curl -s localhost:8899/health` が `{"status":"ok",...}` を返すことを確認する。

- [ ] **Step 2: 検証基準を機械的に測る**

Playwright で実測する。次のスクリプトを `/tmp` などリポジトリ外に置いて実行する（成果物としてコミットしない）。

```js
// measure-browse.mjs
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8899/browse')
await page.waitForSelector('[data-testid="strategy-table-footer"]')
const m = await page.evaluate(() => {
  const table = document.querySelector('table')
  return {
    pageHeight: document.documentElement.scrollHeight,
    tableTop: Math.round(table.getBoundingClientRect().top + window.scrollY),
    tbodyRows: table.querySelectorAll('tbody tr').length,
    domNodes: document.querySelectorAll('*').length,
    footer: document.querySelector('[data-testid="strategy-table-footer"]').textContent,
  }
})
console.log(m)
await browser.close()
```

Run: `node measure-browse.mjs`

Expected:
- `pageHeight` < 8000（現状 43,483）
- `tableTop` < 700（現状 2,657）
- `tbodyRows` === 136
- `footer` に `136` / `275` / `139` / `475` が含まれる

いずれかが基準を満たさない場合は、どの要素が想定より高いかを DOM 実測で切り分けてから直す。基準を緩めて済ませてはならない。

- [ ] **Step 3: 実データで表示内容を目視確認する**

スクリーンショットを撮って実際に読む。数値の整合は目で見ないと分からない（前回 PR #332 で fixture の矛盾を目視で発見した経緯がある）。

確認する点:

1. `AMD EMA+ SuperTrend Trend Following v1` が 1 行で、`15 試行中 1 件実行` と出ている
2. 展開すると 15 件の `strategy_id` が子行に出る
3. 行の名前が長くても崩れず省略記号で切れている
4. 銘柄チップが埋まっている（未実行でも `target_symbols` 由来で出る）
5. フッタの 4 つの数字が実データと一致している
6. レンズ・グループトグル・比較チェックボックス・スライドパネルが従来どおり動く

- [ ] **Step 4: `symbol` 空欄の件数が減ったことを確認する**

Run:
```bash
curl -s localhost:8899/api/strategies | uv run python -c "
import json, sys
d = json.load(sys.stdin)
def eff(x): return x.get('symbol') or (x.get('target_symbols') or [None])[0] or None
print('戦略数', len(d))
print('実効銘柄が不明', sum(1 for x in d if eff(x) is None))
print('item.symbol のみで見た場合の空欄', sum(1 for x in d if not x.get('symbol')))
"
```
Expected: `実効銘柄が不明 23` / `item.symbol のみで見た場合の空欄 334`

API は変えていないので後者は変わらない。画面で埋まるのは前者との差分 311 件である。

- [ ] **Step 5: サーバーを停止してスクリーンショットを再撮影する**

実データのサーバーを止める（撮影は E2E fixture を使う）。

Run: `cd frontend && pnpm run screenshots`
Expected: 全件 PASS

`docs/screenshots/{ja,en}/browse.png` が更新される。撮影 spec の `captureViewport(page, lang, 'browse', 1180)` の縦幅 1180 は「ヘッダー＋銘柄アトラスを収める」ための値だった。アトラスが畳まれた分だけ余白になるので、実際の PNG を見て縦幅を詰める（`capture.spec.ts` の browse テストの第 4 引数）。

- [ ] **Step 6: 撮影した PNG を目で見る**

Read で `docs/screenshots/ja/browse.png` と `docs/screenshots/en/browse.png` を開き、次を確認する。

- 表の行が画面内に十分な数入っている（クロームで埋まっていない）
- フッタの件数が fixture の期待値（6 / 8 / 2 / 11）と一致している
- 英語版で文言が崩れていない

- [ ] **Step 7: 全ゲートを通す**

Run:
```bash
uv run pytest tests/ -q
uv run ruff check src/ tests/
cd frontend && pnpm vitest run && pnpm run lint && pnpm run build && pnpm run e2e
```
Expected: すべて exit 0

`pnpm run lint` の結果はパイプに通さず単独で実行して終了コードを確認する（パイプすると exit code が化ける）。

- [ ] **Step 8: コミット**

```bash
git add docs/screenshots/ja/browse.png docs/screenshots/en/browse.png frontend/e2e/screenshots/capture.spec.ts
git commit -m "docs: ブラウズ画面のスクリーンショットを再撮影

レシピ・ロールアップとクローム圧縮を反映。銘柄アトラスが畳まれた分だけ
撮影の縦幅を詰めた。"
```

- [ ] **Step 9: PR を作成する**

本文はファイルに書いてから渡す（インラインの `--body` はバックティックが壊れる）。

次の本文を雛形として使う。`（実測）` の箇所だけを Task 7 Step 2 の計測結果で置き換える。それ以外はそのまま使える。

```bash
cat > /tmp/pr-body.md <<'BODY'
実運用データ 475 戦略でブラウズ画面が機能していなかったのを、表示単位を
レシピに変えて解消する。ブラウズ画面刷新 3 部作の第 1 部（SP1）。

## 問題（実データで DOM 実測）

| 計測項目 | before |
|---|---|
| ページ全高（1440×900） | 43,483px = 48.3 画面 |
| 表の 1 行目まで | 2,657px |
| tbody 行数 | 475 |
| 銘柄アトラスの高さ | 1,999px |
| DOM ノード数 | 7,887 |

行数以上に中身が問題だった。

- バックテスト未実行で全指標が `—` の空行が 325 件（68%）
- Sharpe ≥ 1.5 は 5 件（1.1%）
- 同名で区別不能な戦略が 324 件（116 グループ・最大 15 件が完全同名）
- symbol 列が空欄の 334 件のうち 311 件は `target_symbols` から判明済み

同名 15 件の正体は `/explore-strategies` の反復ランが生んだ同一レシピの
パラメータ違いだった（`repeat` / `repeat2` / `gate_recheck` / `post917`、
すべて `_optimized`）。1 件ずつ行にする情報価値がない。

## 変更

表示単位を `strategy_id` から `(name, 実効銘柄, timeframe)` のレシピへ変えた。

| 計測項目 | before | after |
|---|---|---|
| ページ全高 | 43,483px | （実測） |
| 表の 1 行目まで | 2,657px | （実測） |
| tbody 行数 | 475 | （実測） |

- レシピ行は展開すると `strategy_id` 付きの子行が出る
- 既定で未実行のみのレシピを外し、隠した件数をフッタに常時表示
- 銘柄アトラス（1,999px）と銘柄チップを折り畳み。削除ではないので機能は残る
- ヒーローの説明文を削除（初回利用者向けの案内は表の空状態が担う）
- 行高を 86px から 44px へ。フォントサイズは変えていない
- 銘柄判定を実効銘柄に統一。311 件の空欄が埋まる

## 設計判断

**ロールアップキーに `name` 単独を使わなかった。** 実データで 6 グループが
別銘柄を含み、`KAMA + RSI(loose) + 4h Trend + Tight Trailing SL` は
AUDUSD / EURUSD / GBPUSD / USDJPY の 4 通貨ペアにまたがる。`name` 単独だと
267 レシピに畳めるが 4 通貨ペアが 1 行に潰れて別物が混ざる。
`(name, 実効銘柄, timeframe)` は 275 レシピで 8 行多いが正しい。

**レシピ行の指標は best 1 件から取る。** 列ごとに最大を取ると実在しない
戦略の成績を合成表示することになる。画面を見ても気付けないので単体テストで
固定し、ablation で判別力を確認した。

**実効銘柄は `??` ではなく `||` でフォールバックする。** API は `None` を
返すため通常は問題ないが、空文字列が来たとき `??` は次候補へ流さない。

## 設計案から意図的に外したもの

| 項目 | 理由 |
|---|---|
| 3 モードタブのシェル | 切り替え先が 1 つしかないタブバーは投機的な抽象化。SP2 で 2 つ目のモードができた時点で導入する |
| 行の仮想化 | 136 行 × 44px では不要。導入するとスクリーンショット撮影と E2E が難しくなるだけ |
| レンズバー・グループトグルの変更 | 合計 116px で問題の主因ではない。既存機能を壊すリスクの方が大きい |
| バックエンド API の変更 | 209KB の一括レスポンスは解析が瞬時。ボトルネックは DOM 側 |

## 未着手

- SP2: カバレッジモード（銘柄 × レシピのマトリクス。銘柄アトラスを正式に置換）
- SP3: 整理モード（未実行 scaffold 235 件・孤児 run 116 ID・重複名 116 グループ）＋ 削除。`alpha-forge` に孤児 run 掃除コマンドの新設が必要

## ゲート

- `uv run pytest tests/ -q`
- `uv run ruff check src/ tests/`
- `pnpm vitest run`
- `pnpm run lint`
- `pnpm run build`（`tsc -b && vite build`）
- `pnpm run e2e`
- `pnpm run screenshots`
BODY
gh pr create --title "feat(browse): ブラウズ画面をレシピ単位に畳んで見やすくする（SP1）" --body-file /tmp/pr-body.md
```

`（実測）` を埋め忘れたまま PR を出さないこと。埋める前に `/usr/bin/grep -n '（実測）' /tmp/pr-body.md` で残っていないか確認する。

---

## 完了条件

| # | 条件 | 確認方法 |
|---|---|---|
| 1 | 実データでページ全高 < 8,000px | Task 7 Step 2 |
| 2 | 実データで表の 1 行目 < 700px | Task 7 Step 2 |
| 3 | 同名 15 件が 1 行に畳まれ展開で個別 ID が出る | Task 7 Step 3 |
| 4 | レシピ行の指標が best 1 件の値である | Task 1 / Task 3 の単体テスト＋ablation |
| 5 | 隠した未実行レシピ数が常に表示される | Task 4 の単体テスト＋Task 6 の E2E |
| 6 | 実効銘柄が不明な戦略が 23 件（334 件から減る） | Task 7 Step 4 |
| 7 | 既存機能（比較・スライドパネル・ソート・グループ・レンズ）が回帰しない | Task 6 の E2E＋Task 7 Step 3 |
| 8 | `uv run pytest tests/ -q` / `uv run ruff check src/ tests/` | Task 7 Step 7 |
| 9 | `pnpm vitest run` / `pnpm run lint` / `pnpm run build` / `pnpm run e2e` | Task 7 Step 7 |
| 10 | `docs/screenshots/{ja,en}/browse.png` が再撮影されている | Task 7 Step 6 |
