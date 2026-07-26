import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { buildRecipes, type Recipe } from '../../../lib/recipes'
import { RecipeRow } from '../RecipeRow'

function mkItem(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
    // strategy_id は overrides に必須プロパティとして含まれるため、下の
    // ...overrides で必ず上書きされる。二重指定は tsc の TS2783
    // （spread による上書き警告）を build エラーにしてしまうため書かない。
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

/**
 * buildRecipes の先頭 1 件を取り出す。テストの入力は常に 1 件以上の bucket
 * になるため実際には undefined にならないが、`noUncheckedIndexedAccess` 下
 * では `Recipe | undefined` になる。非 null 断定（`!`）や `as` でのもみ消し
 * ではなく、前提が崩れたら分かるようにガードする。
 */
function firstRecipe(items: StrategyListItem[]): Recipe {
  const recipe = buildRecipes(items)[0]
  if (!recipe) throw new Error('firstRecipe: buildRecipes が空を返した（テスト入力を確認）')
  return recipe
}

/** 3 試行のうち 1 件だけ実行済み（実データの AMD が 15 試行中 1 件実行）。 */
function threeVariantRecipe(): Recipe {
  return firstRecipe([
    mkItem({ strategy_id: 'amd_v1', latest_sharpe: 0.76, latest_return_pct: 12.4, latest_max_drawdown_pct: -18.2, last_run_at: '2026-04-13T00:00:00' }),
    mkItem({ strategy_id: 'amd_v2' }),
    mkItem({ strategy_id: 'amd_v3' }),
  ])
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
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'v1', latest_sharpe: 1.5, latest_return_pct: 10.0, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'v2', latest_sharpe: 0.5, latest_return_pct: 99.0, last_run_at: '2026-01-02T00:00:00' }),
    ])
    renderRecipe(recipe)
    expect(screen.getByText('1.50')).toBeInTheDocument()
    expect(screen.getByText('10.0%')).toBeInTheDocument()
    expect(screen.queryByText('99.0%')).toBeNull()
  })

  it('試行が 1 件だけなら展開トグルを出さない', () => {
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'only', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
    ])
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
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'a' }),
      mkItem({ strategy_id: 'b' }),
    ])
    renderRecipe(recipe)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('全 variant が未実行なら名前リンクは先頭 variant へ向く', () => {
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'a' }),
      mkItem({ strategy_id: 'b' }),
    ])
    renderRecipe(recipe)
    const link = screen.getByRole('link', { name: /AMD EMA/ })
    expect(link.getAttribute('href')).toBe(`/detail/${recipe.variants[0]?.strategy_id}`)
  })

  /**
   * vis#299: best がチューニング試行（保存していないパラメータ）由来のとき、
   * Browse 一覧の latest 指標がすり替わったことに気づけるようマーカーを出す。
   * レシピ行の指標はすべて best 由来なので、バッジも best の latest_source に従う。
   */
  it('best がチューニング試行ならバッジを出す', () => {
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'v1', latest_sharpe: 1.2, last_run_at: '2026-01-01T00:00:00', latest_source: 'strategy-file' }),
    ])
    renderRecipe(recipe)
    expect(screen.getByTestId('latest-source-badge')).toBeInTheDocument()
  })

  it('best が通常のランならバッジを出さない', () => {
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'v1', latest_sharpe: 1.2, last_run_at: '2026-01-01T00:00:00', latest_source: 'strategy' }),
    ])
    renderRecipe(recipe)
    expect(screen.queryByTestId('latest-source-badge')).not.toBeInTheDocument()
  })
})
