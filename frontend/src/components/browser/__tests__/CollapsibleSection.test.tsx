import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CollapsibleSection } from '../CollapsibleSection'

describe('<CollapsibleSection />', () => {
  it('既定では中身を出さない', () => {
    render(
      <CollapsibleSection label="銘柄カバレッジ（47 銘柄 · 未実行 139 レシピ）">
        <p>中身</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByText('中身')).toBeNull()
    expect(screen.getByRole('button', { name: /銘柄カバレッジ/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('クリックで開閉し aria-expanded が追随する', async () => {
    render(
      <CollapsibleSection label="銘柄カバレッジ（47 銘柄 · 未実行 139 レシピ）">
        <p>中身</p>
      </CollapsibleSection>,
    )
    const toggle = screen.getByRole('button', { name: /銘柄カバレッジ/ })
    await userEvent.click(toggle)
    expect(screen.getByText('中身')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(screen.queryByText('中身')).toBeNull()
  })

  it('defaultOpen で開いた状態から始まる', () => {
    render(
      <CollapsibleSection label="銘柄" defaultOpen>
        <p>中身</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('中身')).toBeInTheDocument()
  })

  it('ラベルは件数を含められる（消えたと誤認させないため）', () => {
    render(
      <CollapsibleSection label="銘柄カバレッジ（47 銘柄 · 未実行 139 レシピ）">
        <p>中身</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText(/47 銘柄/)).toBeInTheDocument()
  })
})
