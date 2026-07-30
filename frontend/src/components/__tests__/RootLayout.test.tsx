import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'
import { RootLayout } from '../RootLayout'

// AppFooter が /health からバージョンを取得するため（issue #399）、
// jsdom で実 fetch が走らないよう api client を mock する。
// 注: useFetchByKey が instanceof ApiError で分岐するため ApiError も含める。
vi.mock('../../api/client', () => {
  class ApiError extends Error {
    readonly status: number
    readonly url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  }
  return {
    ApiError,
    api: {
      getHealth: vi
        .fn()
        .mockResolvedValue({ status: 'ok', forge_dir: '/tmp/forge', version: '9.9.9' }),
    },
  }
})

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
      // CodeQL js/incomplete-url-substring-sanitization は startsWith も
      // 誤検知するため、フッター CTA の URL と完全一致で判定する
      (l) =>
        l.getAttribute('href') ===
        'https://alforgelabs.com/?utm_source=alpha-visualizer&utm_medium=footer',
    )
    expect(link).toBeDefined()
  })
})
