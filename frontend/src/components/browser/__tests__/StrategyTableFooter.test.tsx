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
