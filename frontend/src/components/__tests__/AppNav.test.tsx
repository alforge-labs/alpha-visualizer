import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { AppNav } from '../AppNav'

/** issue #263: 常設のグローバルナビが無く、Ideas/Live/Compare の発見性が低い。 */
describe('AppNav (issue #263)', () => {
  it('renders a navigation landmark with links to the main sections', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ブラウズ' })).toHaveAttribute('href', '/browse')
    expect(screen.getByRole('link', { name: '比較' })).toHaveAttribute('href', '/compare')
    expect(screen.getByRole('link', { name: 'アイデア' })).toHaveAttribute('href', '/ideas')
    expect(screen.getByRole('link', { name: 'ライブ' })).toHaveAttribute('href', '/live')
  })

  it('marks the active route with aria-current="page"', () => {
    render(
      <MemoryRouter initialEntries={['/ideas']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'アイデア' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'ブラウズ' })).not.toHaveAttribute('aria-current')
  })
})
