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
    // グローバルナビ（#263）のリンクも存在するため、href でスキップリンクを特定する
    const skip = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '#main-content')
    expect(skip).toBeDefined()
  })

  it('renders the AlphaForge funnel footer on every screen', () => {
    // ダッシュボード常用ユーザーへの唯一の常設 forge 導線。
    // 全ルート共通の RootLayout に置くことで画面を問わず表示されることを保証する。
    render(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    )
    const footer = screen.getByRole('contentinfo')
    expect(footer).toBeInTheDocument()
    const link = screen.getAllByRole('link').find(
      (l) => (l.getAttribute('href') ?? '').startsWith('https://alforgelabs.com'),
    )
    expect(link).toBeDefined()
  })
})
