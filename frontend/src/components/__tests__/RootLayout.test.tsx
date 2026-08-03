import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { resetAgentBackendsCache } from '../../hooks/useAgentBackends'
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
      // Task 10: RootLayout が useAgentBackends() を呼び showDevelop へ反映する
      getAgentBackends: vi.fn().mockResolvedValue({ enabled: false, backends: [] }),
    },
  }
})

import { api } from '../../api/client'

beforeEach(() => {
  // useAgentBackends は検出結果をモジュール内で共有する（RootLayout と
  // DevelopPage の二重 fetch を避けるため）。持ち越すと、あとから
  // mockResolvedValue を差し替えても前の結果が使われてしまう
  resetAgentBackendsCache()
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

/**
 * Task 10: 「開発」ナビ項目は `useAgentBackends().data?.enabled` に連動する。
 * 非 loopback 公開中や検出失敗時（enabled: false）はナビにも出さない。
 */
describe('RootLayout — AppNav showDevelop wiring (Task 10)', () => {
  it('does not render the Develop nav link when agent backends are disabled', async () => {
    render(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    )
    await waitFor(() => expect(api.getAgentBackends).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: '開発' })).toBeNull()
  })

  it('renders the Develop nav link once agent backends report enabled: true', async () => {
    vi.mocked(api.getAgentBackends).mockResolvedValue({
      enabled: true,
      backends: [{ id: 'claude', available: true, version: '1.0.0' }],
    })
    render(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '開発' })).toHaveAttribute('href', '/develop'),
    )
  })
})
