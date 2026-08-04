import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { AppNav } from '../AppNav'

// ナビは訪問済みセクションの params を sessionStorage に覚える（issue #481）。
// テスト間で記憶が漏れると href の期待値が揺れるため、毎回まっさらにする。
beforeEach(() => {
  sessionStorage.clear()
})

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

  /** issue #484: データ管理画面（/data）への導線。実行一覧の後・アイデアの前。 */
  it('renders a link to the Data screen between Runs and Ideas', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'データ' })).toHaveAttribute('href', '/data')
    const links = screen.getAllByRole('link').map((l) => l.textContent)
    expect(links.indexOf('データ')).toBeGreaterThan(links.indexOf('実行一覧'))
    expect(links.indexOf('データ')).toBeLessThan(links.indexOf('アイデア'))
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

/**
 * issue #481: タブを往復するだけで絞り込みも比較対象も消えていた。
 * 画面状態は URL params が単一の情報源なので、ナビのリンク先が素のパス固定だと
 * 遷移のたびに捨てられる。訪問済みセクションの params を復元する。
 */
describe('AppNav section memory (issue #481)', () => {
  /** 別画面へ移ってから戻るときに、ブラウズの絞り込みが生き残ること。 */
  it('restores the browse filters after leaving the section', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/browse?q=sma&sort=name&starred=1']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    unmount()

    render(
      <MemoryRouter initialEntries={['/compare?ids=a,b']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'ブラウズ' })).toHaveAttribute(
      'href',
      '/browse?q=sma&sort=name&starred=1',
    )
  })

  /** 比較は ids を失うと空状態に落ちる。ナビから戻れることが要件。 */
  it('keeps the compared strategies reachable from the nav', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/compare?ids=a,b']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    unmount()

    render(
      <MemoryRouter initialEntries={['/browse']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '比較' })).toHaveAttribute(
      'href',
      '/compare?ids=a,b',
    )
  })

  /** params 付きの to にしても現在地の判定（aria-current）が壊れないこと。 */
  it('still marks the active route when the link carries params', () => {
    render(
      <MemoryRouter initialEntries={['/browse?q=sma']}>
        <AppNav lang="ja" />
      </MemoryRouter>,
    )
    const browse = screen.getByRole('link', { name: 'ブラウズ' })
    expect(browse).toHaveAttribute('href', '/browse?q=sma')
    expect(browse).toHaveAttribute('aria-current', 'page')
  })
})
