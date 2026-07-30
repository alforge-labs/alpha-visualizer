import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MetricInfoTip } from '../MetricInfoTip'

/**
 * issue #360: 従来のツールチップは onMouseEnter/onMouseLeave のみで、
 * タッチ端末・キーボードでは一切開けなかった。button 化して click / focus
 * でも開閉でき、aria-describedby で支援技術に説明が伝わることを保証する。
 */
describe('MetricInfoTip (issue #360)', () => {
  it('クリックで開き Escape で閉じる（タッチ端末対応）', () => {
    render(<MetricInfoTip defKey="sharpe_ratio" lang="ja" />)
    const btn = screen.getByRole('button')
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(btn)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent(/リスク調整後リターン/)

    fireEvent.keyDown(btn, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('focus で開き blur で閉じる（キーボード対応）', () => {
    render(<MetricInfoTip defKey="profit_factor" lang="ja" />)
    const btn = screen.getByRole('button')

    fireEvent.focus(btn)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.blur(btn)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('開いている間は aria-describedby がツールチップを指す', () => {
    render(<MetricInfoTip defKey="sharpe_ratio" lang="ja" />)
    const btn = screen.getByRole('button')
    expect(btn).not.toHaveAttribute('aria-describedby')

    fireEvent.focus(btn)
    const tip = screen.getByRole('tooltip')
    expect(tip.id).not.toBe('')
    expect(btn).toHaveAttribute('aria-describedby', tip.id)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })

  it('英語 UI では英語の説明を表示する', () => {
    render(<MetricInfoTip defKey="sharpe_ratio" lang="en" />)
    fireEvent.focus(screen.getByRole('button'))
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Risk-adjusted return/)
  })

  it('未定義キーでは何も描画しない', () => {
    const { container } = render(<MetricInfoTip defKey="no_such_metric" lang="ja" />)
    expect(container).toBeEmptyDOMElement()
  })
})
