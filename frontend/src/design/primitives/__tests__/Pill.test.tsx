import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Pill } from '../Pill'

/** issue #260: トグルの押下状態（aria-pressed）が AT に伝わらない。 */
describe('Pill (issue #260)', () => {
  it('exposes aria-pressed=true when active', () => {
    render(
      <Pill active onClick={() => {}}>
        Lens
      </Pill>,
    )
    expect(screen.getByRole('button', { name: 'Lens' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('exposes aria-pressed=false when inactive', () => {
    render(
      <Pill active={false} onClick={() => {}}>
        Lens
      </Pill>,
    )
    expect(screen.getByRole('button', { name: 'Lens' })).toHaveAttribute('aria-pressed', 'false')
  })
})
