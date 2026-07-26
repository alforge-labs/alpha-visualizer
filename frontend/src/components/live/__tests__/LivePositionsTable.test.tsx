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
    //
    // レビュー指摘: 現金行には qty/avg_cost/last_price/pnl の 4 つの DASH
    // セルが常に存在するため、行全体の textContent を見るアサーションは
    // 構成比セル自体の値と無関係に通ってしまう（cash-weight-value 導入前は
    // guard を `?? 0` に壊しても全テストが緑のままになるタウトロジーだった）。
    // 構成比セル単体を data-testid で切り出して検証する。
    render(
      <LivePositionsTable positions={POSITIONS} cash={898032} totalValue={994492} lang="ja" />,
    )
    // 898032 / 994492 * 100 ≈ 90.30%
    expect(screen.getByTestId('cash-weight-value').textContent).toContain('90.3')
  })

  it('totalValue が 0 のときは現金の構成比を em dash にする（0 除算を隠さない）', () => {
    // レビュー指摘: 上と同じ理由で、行全体ではなく構成比セル単体を見る。
    render(<LivePositionsTable positions={[]} cash={0} totalValue={0} lang="ja" />)
    const weightCell = screen.getByTestId('cash-weight-value')
    expect(weightCell.textContent).toContain('—')
    expect(weightCell.textContent).not.toMatch(/\d/)
  })

  it('建玉はあるのに totalValue が 0 以下のときは現金・合計を em dash にする（Finding 3: 捏造された 0 を表示しない）', () => {
    // WHY: cash/total_value（forge#1335）が未移行の行は repository が NULL を
    // 0.0 にフォールバックするため、建玉合計（実数・33,471）の隣に
    // 現金 0.000 / 合計 0.000 という「存在しない口座価値」が並んでしまう。
    // unrealized_pnl と同じ判断（不明を 0 で埋めない）をここでも守る。
    render(
      <LivePositionsTable positions={POSITIONS} cash={0} totalValue={0} lang="ja" />,
    )
    const cashCell = screen.getByTestId('cash-value')
    const totalCell = screen.getByTestId('total-value')
    expect(cashCell.textContent).toContain('—')
    expect(cashCell.textContent).not.toMatch(/\d/)
    expect(totalCell.textContent).toContain('—')
    expect(totalCell.textContent).not.toMatch(/\d/)
    // 建玉合計自体は実数のまま出ることを対で固定する（行全体が dash 化した偽陽性を防ぐ）
    expect(screen.getByTestId('positions-subtotal-value').textContent).toContain('33,471')
  })

  it('建玉が無ければ totalValue が 0 でも現金・合計は通常どおり数値で表示する（ノーポジション口座の正当な 0）', () => {
    // WHY: Finding 3 のガードは「建玉があるのに totalValue が捏造された 0」を
    // 弾くためのもの。建玉ゼロの口座で本当に価値が 0 なら、それは正当な値
    // であり dash にすり替えてはならない。
    render(<LivePositionsTable positions={[]} cash={0} totalValue={0} lang="ja" />)
    expect(screen.getByTestId('cash-value').textContent).toContain('0')
    expect(screen.getByTestId('total-value').textContent).toContain('0')
  })

  it('テーブルにスクリーンリーダー向けの caption と列見出しの scope="col" を備える', () => {
    // WHY(Finding b): 建玉テーブルは金融保有情報を提示するにもかかわらず
    // <th scope="col"> も <caption> も無く、ChartDataTable.tsx が既に
    // 採用しているアクセシブルなパターンに追随していなかった。
    render(
      <LivePositionsTable positions={POSITIONS} cash={898032} totalValue={994492} lang="ja" />,
    )
    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(0)
    for (const th of headers) {
      expect(th).toHaveAttribute('scope', 'col')
    }
    // caption は視覚的に隠れていてもアクセシブルツリー上は table の説明として存在する
    expect(table.querySelector('caption')).not.toBeNull()
  })
})
