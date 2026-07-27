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
