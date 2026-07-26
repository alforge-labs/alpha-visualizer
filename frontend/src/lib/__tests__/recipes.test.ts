import { describe, expect, it } from 'vitest'
import type { StrategyListItem } from '../../api/types'
import { buildRecipes, effectiveSymbol, pickBestVariant } from '../recipes'

/** 必要なフィールドだけ上書きできる StrategyListItem のファクトリ。 */
function item(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
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

describe('buildRecipes', () => {
  it('同名・同銘柄・同時間軸を 1 レシピに畳む', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'v1', name: 'AMD EMA ST', symbol: 'AMD', latest_sharpe: 0.5, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'v2', name: 'AMD EMA ST', symbol: 'AMD', latest_sharpe: 0.8, last_run_at: '2026-01-02T00:00:00' }),
      item({ strategy_id: 'v3', name: 'AMD EMA ST', symbol: 'AMD' }),
    ])
    expect(recipes).toHaveLength(1)
    expect(recipes[0]?.variantCount).toBe(3)
    expect(recipes[0]?.runCount).toBe(2)
    expect(recipes[0]?.best?.strategy_id).toBe('v2')
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
    expect(recipes[0]?.symbol).toBe('SPY')
    expect(recipes[0]?.variantCount).toBe(2)
    expect(recipes[0]?.runCount).toBe(1)
  })

  it('レシピ行の指標は best 1 件から取り、列ごとの最大を混ぜない', () => {
    // Sharpe 最大は v1、リターン最大は v2。行は v1 のリターンを出さなければ
    // ならない。列ごとに Math.max を取る実装だと存在しない戦略の成績になる。
    const recipes = buildRecipes([
      item({ strategy_id: 'v1', name: 'X', symbol: 'SPY', latest_sharpe: 1.5, latest_return_pct: 10, latest_max_drawdown_pct: -30, last_run_at: '2026-01-01T00:00:00' }),
      item({ strategy_id: 'v2', name: 'X', symbol: 'SPY', latest_sharpe: 0.5, latest_return_pct: 99, latest_max_drawdown_pct: -5, last_run_at: '2026-01-02T00:00:00' }),
    ])
    expect(recipes[0]?.best?.strategy_id).toBe('v1')
    expect(recipes[0]?.best?.latest_return_pct).toBe(10)
    expect(recipes[0]?.best?.latest_max_drawdown_pct).toBe(-30)
  })

  it('全 variant が未実行なら best は null で runCount は 0', () => {
    const recipes = buildRecipes([
      item({ strategy_id: 'a', name: 'X', symbol: 'SPY' }),
      item({ strategy_id: 'b', name: 'X', symbol: 'SPY' }),
    ])
    expect(recipes[0]?.best).toBeNull()
    expect(recipes[0]?.runCount).toBe(0)
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
    expect(recipes[0]?.variants.map(v => v.strategy_id)).toEqual(['high', 'low', 'none'])
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
