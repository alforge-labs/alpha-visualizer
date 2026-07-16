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
    expect(link.getAttribute('href')).toBe('https://alforgelabs.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel') ?? '').toContain('noopener')
    expect(link.getAttribute('rel') ?? '').toContain('noreferrer')
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
