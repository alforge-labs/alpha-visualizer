import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LivePositionsTable } from '../LivePositionsTable'
import type { LivePosition } from '../../../api/types'

const POSITIONS: LivePosition[] = [
  {
    ticker: 'US.GLD', qty: 90, avg_cost: 396.64, last_price: 371.9,
    market_value: 33471, weight_pct: 3.4, unrealized_pnl: -2227, unrealized_pnl_pct: -6.2,
  },
]

describe('LivePositionsTable', () => {
  it('建玉と現金の行を表示する', () => {
    render(
      <LivePositionsTable positions={POSITIONS} cash={898032} totalValue={994492} lang="ja" />,
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('US.GLD')).toBeInTheDocument()
    expect(table.textContent).toContain('898,032')  // 現金
  })

  it('再構築値である旨の注記を出す', () => {
    render(
      <LivePositionsTable positions={POSITIONS} cash={0} totalValue={33471} lang="ja" />,
    )
    expect(screen.getByTestId('positions-caveat').textContent).toContain('再構築')
  })

  it('建玉が空でも現金行は出す', () => {
    render(<LivePositionsTable positions={[]} cash={1_000_000} totalValue={1_000_000} lang="ja" />)
    expect(screen.getByRole('table').textContent).toContain('1,000,000')
  })

  it('含み損益が null の場合は em dash 表示にする（0 と誤認させない）', () => {
    // WHY: unrealized_pnl / unrealized_pnl_pct は cost basis 未解決時に
    // backend が null を返す（0 に丸めない設計）。表示側で ?? 0 のような
    // フォールバックを入れると「損益ゼロ」という偽の情報になってしまうため、
    // このケースを固定するテストを置く（brief には無いが nullable である
    // 理由そのものを守るテスト）。
    const nullPnlPosition: LivePosition = {
      ticker: 'US.UNKNOWN',
      qty: 10,
      avg_cost: 100,
      last_price: 105,
      market_value: 1050,
      weight_pct: 1.0,
      unrealized_pnl: null,
      unrealized_pnl_pct: null,
    }
    render(
      <LivePositionsTable positions={[nullPnlPosition]} cash={0} totalValue={1050} lang="ja" />,
    )
    const pnlCell = screen.getByTestId('pnl-cell-US.UNKNOWN')
    // em dash が入っていること、かつ数字が一切現れないこと（"0" や "0.0%" ではない）
    expect(pnlCell.textContent).toContain('—')
    expect(pnlCell.textContent).not.toMatch(/\d/)
  })
})
