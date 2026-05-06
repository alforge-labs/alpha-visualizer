import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OverflowMenu } from '../OverflowMenu'

describe('OverflowMenu (issue #54)', () => {
  it('renders trigger button with aria-haspopup', () => {
    render(<OverflowMenu items={[{ label: 'A', onClick: () => {} }]} />)
    const btn = screen.getByRole('button', { name: 'More actions' })
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens menu on click and exposes role="menu" with role="menuitem" children', () => {
    const onA = vi.fn()
    render(
      <OverflowMenu
        items={[
          { label: 'A', onClick: onA },
          { label: 'B', onClick: () => {} },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
  })

  it('invokes the onClick handler and closes when an item is clicked', () => {
    const onA = vi.fn()
    render(<OverflowMenu items={[{ label: 'A', onClick: onA }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'A' }))
    expect(onA).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when Escape is pressed', () => {
    render(<OverflowMenu items={[{ label: 'A', onClick: () => {} }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when clicking outside', () => {
    render(
      <div>
        <OverflowMenu items={[{ label: 'A', onClick: () => {} }]} />
        <button data-testid="outside">outside</button>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('skips disabled items without invoking handler', () => {
    const onA = vi.fn()
    render(<OverflowMenu items={[{ label: 'A', onClick: onA, disabled: true }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'A' }))
    expect(onA).not.toHaveBeenCalled()
  })
})
