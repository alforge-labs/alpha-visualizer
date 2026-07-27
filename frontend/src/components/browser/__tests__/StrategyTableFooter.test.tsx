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
    // recipeTotal と strategyTotal を取り違えても toContain は緑のままになるため、
    // 文言の並び順まで含めて全文一致で検証する
    expect(text).toBe('136 レシピ表示 / 全 275 レシピ（未実行のみ 139 レシピを非表示） · 475 戦略')
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
    expect(text).toBe('136 of 275 recipes (139 unrun-only recipes hidden) · 475 strategies')
  })
})
