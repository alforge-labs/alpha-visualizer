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

  it('実数の含み損益はそのまま表示する（null 用の em dash 経路に飲み込まれない）', () => {
    // WHY(レビュー指摘): null ケースだけを固定すると、fmtDiff の配線ミスや
    // 将来のリファクタで「常に em dash になる」regression が起きても
    // 気づけない。実損益が確かに数値として出ることも対で固定する。
    render(
      <LivePositionsTable positions={POSITIONS} cash={898032} totalValue={994492} lang="ja" />,
    )
    const pnlCell = screen.getByTestId('pnl-cell-US.GLD')
    expect(pnlCell.textContent).not.toContain('—')
    expect(pnlCell.textContent).toContain('-2,227') // 含み損益額
    expect(pnlCell.textContent).toContain('-6.2') // 含み損益率
  })

  it('合計行は建玉合計＋現金と一致する（呼び出し側が一貫した値を渡す前提を明示）', () => {
    // WHY(レビュー指摘): totalValue は呼び出し側が算出した値をそのまま
    // 表示するだけなので、positions を後からフィルタする等で
    // cash/totalValue と食い違っても検知できない。今は一致する契約である
    // ことをテストで明示し、崩れたら気づけるようにする。
    const positionsSubtotal = 33471 // POSITIONS の market_value 合計
    const cash = 898032
    const totalValue = positionsSubtotal + cash
    render(
      <LivePositionsTable positions={POSITIONS} cash={cash} totalValue={totalValue} lang="ja" />,
    )
    const num = (text: string | null): number => Number((text ?? '').replace(/,/g, ''))
    const subtotal = num(screen.getByTestId('positions-subtotal-value').textContent)
    const cashValue = num(screen.getByTestId('cash-value').textContent)
    const total = num(screen.getByTestId('total-value').textContent)
    expect(total).toBeCloseTo(subtotal + cashValue, 5)
  })

  it('現金の構成比は cash / totalValue で表示する（総現金比率が一目で分かる）', () => {
    // WHY: design doc は「資産の約90%が現金」という実態を構成比で可視化する
    // ことを目的に挙げている。銘柄の構成比だけでは、残り(=現金比率)は
    // 読み手が暗算する必要があり目的を満たさない。
    render(
      <LivePositionsTable positions={POSITIONS} cash={898032} totalValue={994492} lang="ja" />,
    )
    const cashRow = screen.getByTestId('cash-value').closest('tr')
    expect(cashRow).not.toBeNull()
    // 898032 / 994492 * 100 ≈ 90.30%
    expect(cashRow!.textContent).toContain('90.3')
  })

  it('totalValue が 0 のときは現金の構成比を em dash にする（0 除算を隠さない）', () => {
    render(<LivePositionsTable positions={[]} cash={0} totalValue={0} lang="ja" />)
    const cashRow = screen.getByTestId('cash-value').closest('tr')
    expect(cashRow).not.toBeNull()
    expect(cashRow!.textContent).toContain('—')
  })
})
