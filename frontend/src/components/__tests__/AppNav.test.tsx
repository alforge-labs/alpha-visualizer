import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

  /** SP3: 孤児バックテスト結果の掃除画面（/maintenance）への導線を追加。5 項目目。 */
  it('renders a link to the Maintenance screen', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '整理' })).toHaveAttribute('href', '/maintenance')
  })

  /** Task 10: showDevelop 未指定/false のときは「開発」項目を出さない（既定は非表示）。 */
  it('does not render the Develop link when showDevelop is omitted', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: '開発' })).toBeNull()
  })

  /** Task 10: showDevelop=true のとき「開発」項目がライブの後・整理の前に出る。 */
  it('renders the Develop link between Live and Maintenance when showDevelop is true', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="ja" showDevelop />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link').map((l) => l.textContent)
    const liveIndex = links.indexOf('ライブ')
    const developIndex = links.indexOf('開発')
    const maintenanceIndex = links.indexOf('整理')
    expect(developIndex).toBeGreaterThan(liveIndex)
    expect(developIndex).toBeLessThan(maintenanceIndex)
    expect(screen.getByRole('link', { name: '開発' })).toHaveAttribute('href', '/develop')
  })

  it('renders the Develop link label in English when lang=en', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="en" showDevelop />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Develop' })).toHaveAttribute('href', '/develop')
  })
})
