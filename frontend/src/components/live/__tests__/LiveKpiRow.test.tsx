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

  it('ベンチマークとBTが両方あれば、それぞれ別の値を表示する', () => {
    // WHY: 指数とBTの系列が同じ値だと、excessReturnPt の呼び出しで
    // benchValues と btValues を取り違えても（vs指数とvsBTの表示が
    // 入れ替わっても）テストが偽陽性で通ってしまう。数値をはっきり
    // 分岐させることで、引数の取り違えを検知できるようにする。
    render(
      <LiveKpiRow
        equity={EQUITY}
        benchmarkEquity={[
          ['2026-06-04T00:00:00', 1_000_000],
          ['2026-06-06T00:00:00', 1_020_000], // +2.0%
        ]}
        backtestEquity={[
          ['2026-06-04T00:00:00', 1_000_000],
          ['2026-06-06T00:00:00', 1_050_000], // +5.0%
        ]}
        lang="ja"
      />,
    )
    // Live -0.6% vs Bench +2.0% → -2.6pt
    expect(screen.getByTestId('kpi-excess-index').textContent).toContain('-2.6')
    // Live -0.6% vs BT +5.0% → -5.6pt
    expect(screen.getByTestId('kpi-excess-backtest').textContent).toContain('-5.6')
  })

  it('BTが無ければ vs BT の超過リターンを出さない（ベンチマークのみ指定時）', () => {
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
    expect(screen.getByTestId('kpi-excess-index')).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-excess-backtest')).not.toBeInTheDocument()
  })

  it('計測期間（日数と開始日）を表示する', () => {
    render(<LiveKpiRow equity={EQUITY} lang="ja" />)
    // 2026-06-04 〜 2026-06-06 の暦日数 = 2日、開始日 = 2026-06-04
    const period = screen.getByTestId('kpi-period').textContent
    expect(period).toContain('2日')
    expect(period).toContain('2026-06-04')
  })

  it('equity が空でもクラッシュしない', () => {
    render(<LiveKpiRow equity={[]} lang="ja" />)
    expect(screen.queryByTestId('kpi-current-value')).not.toBeInTheDocument()
  })
})
