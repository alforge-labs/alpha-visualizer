import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AppFooter } from '../AppFooter'

/**
 * OSS ダッシュボード常用ユーザーは README やターミナルバナーを見ないため、
 * Web UI 内に AlphaForge（フルエンジン）への導線を常設する（送客ファネル C3 の
 * UI 展開）。フッターは contentinfo ランドマークとして AT からも到達可能にする。
 */
describe('<AppFooter />', () => {
  it('renders a contentinfo landmark with the AlphaForge CTA link (ja)', () => {
    render(<AppFooter lang="ja" />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /AlphaForge/ })
    // UTM で「アプリ内フッター経由の流入」を計測可能にする（Wave 4）
    expect(link.getAttribute('href')).toBe(
      'https://alforgelabs.com/?utm_source=alpha-visualizer&utm_medium=footer',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel') ?? '').toContain('noopener')
    expect(link.getAttribute('rel') ?? '').toContain('noreferrer')
  })

  it('announces the new-tab navigation in the accessible name', () => {
    // target="_blank" は視覚外の文脈変化なので、SR 利用者にも新規タブ遷移を
    // アクセシブルネームで伝える（装飾矢印 ↗ は aria-hidden で読み上げ対象外）。
    // ヘルプ導線（issue #361）を含む全リンクが対象。
    render(<AppFooter lang="ja" />)
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(3)
    for (const link of links) {
      expect(link.getAttribute('aria-label') ?? '').toContain('別タブで開く')
      expect(link.getAttribute('aria-label') ?? '').not.toContain('↗')
    }
  })

  it('shows the ja CTA copy for lang=ja', () => {
    render(<AppFooter lang="ja" />)
    expect(screen.getByText(/無料で試す/)).toBeInTheDocument()
  })

  it('shows the en CTA copy for lang=en', () => {
    render(<AppFooter lang="en" />)
    expect(screen.getByText(/Try .* free/i)).toBeInTheDocument()
  })
})

/**
 * issue #361: アプリ内ヘルプ導線がゼロ（フッターはマーケ CTA のみ）だった。
 * 使用中に詰まったユーザーが公式 docs / FAQ に 1 クリックで到達できる
 * 言語別リンクを常設する。
 */
describe('<AppFooter /> のヘルプ導線 (issue #361)', () => {
  it('ja では日本語 docs / FAQ へのリンクを表示する', () => {
    render(<AppFooter lang="ja" />)
    const help = screen.getByRole('link', { name: /ヘルプ/ })
    expect(help.getAttribute('href')).toContain('/ja/docs/alpha-visualizer/')
    const faq = screen.getByRole('link', { name: /FAQ/ })
    expect(faq.getAttribute('href')).toContain('/ja/docs/alpha-visualizer/faq/')
    expect(faq.getAttribute('target')).toBe('_blank')
    expect(faq.getAttribute('rel') ?? '').toContain('noopener')
  })

  it('en では英語 docs / FAQ へのリンクを表示する', () => {
    render(<AppFooter lang="en" />)
    const help = screen.getByRole('link', { name: /Help/ })
    expect(help.getAttribute('href')).toContain('/en/docs/alpha-visualizer/')
    const faq = screen.getByRole('link', { name: /FAQ/ })
    expect(faq.getAttribute('href')).toContain('/en/docs/alpha-visualizer/faq/')
  })
})
