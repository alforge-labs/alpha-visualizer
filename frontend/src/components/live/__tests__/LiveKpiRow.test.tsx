import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LiveKpiRow } from '../LiveKpiRow'

const EQUITY: [string, number][] = [
  ['2026-06-04T00:00:00', 1_000_000],
  ['2026-06-05T00:00:00', 1_010_000],
  ['2026-06-06T00:00:00', 994_000],
]

describe('LiveKpiRow', () => {
  it('現在評価額・累計損益・現在DD を表示する', () => {
    render(<LiveKpiRow equity={EQUITY} lang="ja" />)
    expect(screen.getByTestId('kpi-current-value').textContent).toContain('994,000')
    // 累計損益 = 994,000 - 1,000,000
    expect(screen.getByTestId('kpi-total-pnl').textContent).toContain('-6,000')
    // 現在DD = 994,000 / 1,010,000 - 1 = -1.58%
    expect(screen.getByTestId('kpi-current-dd').textContent).toContain('-1.58')
  })

  it('ベンチマークがあれば超過リターンを表示する', () => {
    render(
      <LiveKpiRow
        equity={EQUITY}
        benchmarkEquity={[
          ['2026-06-04T00:00:00', 1_000_000],
          ['2026-06-06T00:00:00', 1_020_000],
        ]}
        lang="ja"
      />,
    )
    // Live -0.6% vs Bench +2.0% → -2.6pt
    expect(screen.getByTestId('kpi-excess-index').textContent).toContain('-2.6')
  })

  it('ベンチマークが無ければ超過リターンを出さない（旧 DB 互換）', () => {
    render(<LiveKpiRow equity={EQUITY} lang="ja" />)
    expect(screen.queryByTestId('kpi-excess-index')).not.toBeInTheDocument()
  })

  it('equity が空でもクラッシュしない', () => {
    render(<LiveKpiRow equity={[]} lang="ja" />)
    expect(screen.queryByTestId('kpi-current-value')).not.toBeInTheDocument()
  })
})
