import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { RootLayout } from '../RootLayout'

/**
 * issue #260: <main> ランドマークと skip-link が無く、キーボード/SR 利用者が
 * 本文へ直接移動できなかった（axe landmark-one-main / region）。
 */
describe('RootLayout (issue #260)', () => {
  it('renders a single main landmark with the skip-link target id', () => {
    render(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    )
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
  })

  it('renders a skip link pointing to the main content', () => {
    render(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    )
    const skip = screen.getByRole('link')
    expect(skip).toHaveAttribute('href', '#main-content')
  })
})
