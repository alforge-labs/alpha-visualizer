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
    // アクセシブルネームで伝える（装飾矢印 ↗ は aria-hidden で読み上げ対象外）
    render(<AppFooter lang="ja" />)
    const link = screen.getByRole('link', { name: /別タブで開く/ })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('aria-label') ?? '').not.toContain('↗')
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
