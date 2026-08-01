import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AnnualSummaryTable } from '../AnnualSummaryTable'

/**
 * issue #383: AnnualReturnsBar の下に年別サマリテーブルを常設する。
 */
describe('AnnualSummaryTable (issue #383)', () => {
  it('年別の数表を描画し、欠損は — で示す', () => {
    render(
      <AnnualSummaryTable
        annualReturns={{ '2023': -3.2, '2024': 12.5 }}
        benchmarkReturns={{ '2024': 10.0 }}
        annualMaxDrawdown={{ '2023': -18.4 }}
        trades={[{ exit_date: '2024-02-01', return_pct: 1.5 } as never]}
        lang="ja"
      />,
    )
    const table = screen.getByRole('table', { name: /年別サマリ/ })
    expect(table).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2023' })).toBeInTheDocument()
    expect(screen.getByText('-18.4%')).toBeInTheDocument()
    // 2023 のベンチは欠損 → —
    expect(screen.getAllByRole('cell', { name: '—' }).length).toBeGreaterThan(0)
  })

  it('annual_returns が空なら描画しない', () => {
    const { container } = render(
      <AnnualSummaryTable annualReturns={{}} lang="ja" />,
    )
    expect(container.firstChild).toBeNull()
  })
})
