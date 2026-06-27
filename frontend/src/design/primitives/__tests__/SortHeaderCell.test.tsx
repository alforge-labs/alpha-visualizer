import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SortHeaderCell } from '../SortHeaderCell'

/**
 * issue #259: ソート可能なテーブルヘッダが `<th onClick>` のみで、キーボード非対応・
 * `aria-sort` 欠落・セル↔ヘッダ関連付け（scope）欠落だった。
 * 共有ヘッダセルは <th scope="col"> 内に <button> を持ち、aria-sort で並べ替え状態を伝える。
 */
function renderCell(props: Partial<React.ComponentProps<typeof SortHeaderCell>> = {}) {
  const onSort = props.onSort ?? vi.fn()
  render(
    <table>
      <thead>
        <tr>
          <SortHeaderCell
            label="Sharpe"
            active={false}
            direction="asc"
            onSort={onSort}
            {...props}
          />
        </tr>
      </thead>
    </table>,
  )
  return { onSort }
}

describe('SortHeaderCell (issue #259)', () => {
  it('renders the header as a real button so it is keyboard operable', () => {
    const { onSort } = renderCell()
    const btn = screen.getByRole('button', { name: /Sharpe/ })
    fireEvent.click(btn)
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('associates cells via scope="col"', () => {
    renderCell()
    expect(screen.getByRole('columnheader')).toHaveAttribute('scope', 'col')
  })

  it('exposes aria-sort="none" when not the active sort column', () => {
    renderCell({ active: false })
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')
  })

  it('exposes aria-sort="ascending" when active and ascending', () => {
    renderCell({ active: true, direction: 'asc' })
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('exposes aria-sort="descending" when active and descending', () => {
    renderCell({ active: true, direction: 'desc' })
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })
})
