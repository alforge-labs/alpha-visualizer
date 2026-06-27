import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { FilterBar } from '../FilterBar'

/**
 * issue #260: フィルタ入力が placeholder のみでアクセシブル名を欠き、
 * 銘柄チップトグルが aria-pressed を欠いていた。
 */
function renderBar() {
  render(
    <MemoryRouter>
      <FilterBar symbols={['SPY']} timeframes={['1D']} lang="ja" />
    </MemoryRouter>,
  )
}

describe('FilterBar (issue #260)', () => {
  it('gives the search input an accessible name', () => {
    renderBar()
    expect(screen.getByRole('textbox', { name: /検索/ })).toBeInTheDocument()
  })

  it('gives the Sharpe and DD number inputs accessible names', () => {
    renderBar()
    expect(screen.getByRole('spinbutton', { name: /Sharpe/ })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /DD/ })).toBeInTheDocument()
  })

  it('exposes aria-pressed on symbol filter chips', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'SPY' })).toHaveAttribute('aria-pressed', 'false')
  })
})
