import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { Tab, TabBar } from '../TabBar'

/**
 * issue #258: 詳細画面のタブが roving tabindex（非アクティブ tab = tabIndex -1）なのに
 * 矢印キーハンドラが無く、キーボードのみの利用者がアクティブタブ以外へ到達できない。
 * WAI-ARIA tabs パターン（自動アクティベーション: 矢印でフォーカス移動＋選択）を満たすこと。
 */
function Harness({ labels = ['One', 'Two', 'Three'] }: { labels?: string[] }) {
  const [active, setActive] = useState(0)
  return (
    <TabBar ariaLabel="test tabs">
      {labels.map((l, i) => (
        <Tab key={l} active={active === i} onClick={() => setActive(i)}>
          {l}
        </Tab>
      ))}
    </TabBar>
  )
}

describe('TabBar keyboard navigation (issue #258)', () => {
  it('moves focus and selection to the next tab on ArrowRight', () => {
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    const two = screen.getByRole('tab', { name: 'Two' })
    one.focus()
    expect(one).toHaveFocus()

    fireEvent.keyDown(one, { key: 'ArrowRight' })

    expect(two).toHaveFocus()
    expect(two).toHaveAttribute('aria-selected', 'true')
    expect(one).toHaveAttribute('aria-selected', 'false')
    // roving tabindex: 選択タブのみ 0、他は -1
    expect(two.getAttribute('tabindex')).toBe('0')
    expect(one.getAttribute('tabindex')).toBe('-1')
  })

  it('wraps to the last tab on ArrowLeft from the first', () => {
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    const three = screen.getByRole('tab', { name: 'Three' })
    one.focus()

    fireEvent.keyDown(one, { key: 'ArrowLeft' })

    expect(three).toHaveFocus()
    expect(three).toHaveAttribute('aria-selected', 'true')
  })

  it('jumps to first/last tab with Home/End', () => {
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    const three = screen.getByRole('tab', { name: 'Three' })
    one.focus()

    fireEvent.keyDown(one, { key: 'End' })
    expect(three).toHaveFocus()

    fireEvent.keyDown(three, { key: 'Home' })
    expect(one).toHaveFocus()
  })

  it('ignores unrelated keys', () => {
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    one.focus()

    fireEvent.keyDown(one, { key: 'a' })

    expect(one).toHaveFocus()
    expect(one).toHaveAttribute('aria-selected', 'true')
  })
})
