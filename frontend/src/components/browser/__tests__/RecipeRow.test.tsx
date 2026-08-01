import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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
          starred={false}
          onToggleStar={vi.fn()}
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

  it('銘柄がどこからも判明しなければ未割当と出す', () => {
    // symbol も target_symbols も無ければ effectiveSymbol は null になり、
    // レシピの symbol も null になる。timeframe の有無は問わない。
    const recipe = firstRecipe([
      mkItem({ strategy_id: 'v1', symbol: null, target_symbols: [], latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
    ])
    renderRecipe(recipe)
    expect(screen.getByText(/未割当/)).toBeInTheDocument()
  })

  it('DD・PF・勝率・最終実行日も best 1 件の値で、列ごとの最良/最悪を混ぜない', () => {
    // best（Sharpe 最大）の他指標をあえて「中間」の値にし、他 variant 側に
    // 各指標の最良・最悪を分散させる。列ごとに Math.max でも Math.min でも
    // 合成表示すれば必ず best の値からズレる設計。
    const recipe = firstRecipe([
      mkItem({
        strategy_id: 'best',
        latest_sharpe: 2.0, // 最大 → best として選ばれる
        latest_max_drawdown_pct: -20, // 中間（他は -80 / -5）
        latest_profit_factor: 1.5, // 中間（他は 0.3 / 5.0）
        latest_win_rate_pct: 50, // 中間（他は 10 / 95）
        last_run_at: '2026-03-01T00:00:00', // 中間（他は 01-01 / 06-01）
      }),
      mkItem({
        strategy_id: 'worst_case',
        latest_sharpe: 1.0,
        latest_max_drawdown_pct: -80, // 全体最悪 DD
        latest_profit_factor: 0.3, // 全体最悪 PF
        latest_win_rate_pct: 10, // 全体最悪勝率
        last_run_at: '2026-01-01T00:00:00', // 全体最古
      }),
      mkItem({
        strategy_id: 'best_case',
        latest_sharpe: 0.5,
        latest_max_drawdown_pct: -5, // 全体最良 DD
        latest_profit_factor: 5.0, // 全体最良 PF
        latest_win_rate_pct: 95, // 全体最良勝率
        last_run_at: '2026-06-01T00:00:00', // 全体最新
      }),
    ])
    renderRecipe(recipe)

    expect(screen.getByText('2.00')).toBeInTheDocument() // Sharpe = best
    expect(screen.getByText('-20.0%')).toBeInTheDocument() // DD = best
    expect(screen.getByText('1.50')).toBeInTheDocument() // PF = best
    expect(screen.getByText('50.0%')).toBeInTheDocument() // Win% = best
    expect(screen.getByText('2026-03-01')).toBeInTheDocument() // Last run = best

    expect(screen.queryByText('-80.0%')).toBeNull()
    expect(screen.queryByText('-5.0%')).toBeNull()
    expect(screen.queryByText('0.30')).toBeNull()
    expect(screen.queryByText('5.00')).toBeNull()
    expect(screen.queryByText('10.0%')).toBeNull()
    expect(screen.queryByText('95.0%')).toBeNull()
    expect(screen.queryByText('2026-01-01')).toBeNull()
    expect(screen.queryByText('2026-06-01')).toBeNull()
  })
})

/**
 * issue #397: 同名戦略が複数銘柄にあると比較チェックボックスの aria-label が
 * 完全に同一になり SR で区別できなかった。StrategyRow と同じく best の
 * strategy_id を含めて一意化する。
 */
describe('RecipeRow compare checkbox aria-label (issue #397)', () => {
  it('aria-label に best の strategy_id を含めて一意化する', () => {
    const recipe = threeVariantRecipe()
    renderRecipe(recipe)
    const checkbox = screen.getByRole('checkbox')
    const label = checkbox.getAttribute('aria-label') ?? ''
    // 同名戦略が複数銘柄にあっても SR で区別できるよう ID を含める
    expect(label).toContain('amd_v1')
  })
})

/**
 * issue #379: レシピ行のスター。クリックで onToggleStar(recipe.key) を呼び、
 * 行選択（onSelect）は発火しない。
 */
describe('RecipeRow star button (issue #379)', () => {
  it('スターの toggle と行クリック抑止', () => {
    const recipe = threeVariantRecipe()
    const onToggleStar = vi.fn()
    const onSelect = vi.fn()
    render(
      <MemoryRouter>
        <table><tbody>
          <RecipeRow
            recipe={recipe}
            expanded={false}
            onToggleExpand={vi.fn()}
            selectedId={null}
            onSelect={onSelect}
            compareIds={[]}
            onToggleCompare={vi.fn()}
            starred={false}
            onToggleStar={onToggleStar}
            onHover={vi.fn()}
            sparkValues={undefined}
            lang="ja"
          />
        </tbody></table>
      </MemoryRouter>,
    )
    const star = screen.getByRole('button', { name: /スターを付ける/ })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    star.click()
    expect(onToggleStar).toHaveBeenCalledWith(recipe.key)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
