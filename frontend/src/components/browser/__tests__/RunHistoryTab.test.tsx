import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { StrategyRun } from '../../../api/types'
import { RunHistoryTab } from '../RunHistoryTab'

/**
 * issue #261: リターンの符号が色のみで伝えられ、色覚特性によっては正負が区別できない。
 * 正の値に "+" を付け、符号をテキストでも明示する。
 */
const runs = [
  { run_id: 'a', run_at: '2025-01-01T00:00', sharpe_ratio: 1.2, total_return_pct: 12.3, max_drawdown_pct: -5 },
  { run_id: 'b', run_at: '2025-01-02T00:00', sharpe_ratio: 0.2, total_return_pct: -8.4, max_drawdown_pct: -10 },
] as unknown as StrategyRun[]

describe('RunHistoryTab return sign (issue #261)', () => {
  it('shows an explicit sign for positive and negative returns', () => {
    render(<RunHistoryTab runs={runs} currentRunId="a" onSelectRun={() => {}} lang="ja" />)
    expect(screen.getByText('+12.3%')).toBeInTheDocument()
    expect(screen.getByText('-8.4%')).toBeInTheDocument()
  })
})

/**
 * issue #264: 現在行ハイライトがテラコッタ基調と不調和な緑 rgba(0,228,154,...) の
 * 直書きだった。パレットに調和する accent トークンへ置換し、両テーマで成立させる。
 */
describe('RunHistoryTab current-row highlight (issue #264)', () => {
  it('highlights the current row with a palette token, not hardcoded green', () => {
    const { container } = render(
      <RunHistoryTab runs={runs} currentRunId="a" onSelectRun={() => {}} lang="ja" />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0]!.getAttribute('style')).toContain('var(--accent-bg)')
    expect(rows[1]!.getAttribute('style')).toContain('transparent')
    expect(container.innerHTML).not.toContain('rgba(0,228,154')
  })
})

/**
 * issue #266: 数値整形を SSoT（lib/format）経由へ統一し、桁区切りを効かせる。
 * 直書き toFixed では大きなリターンが区切り無しで表示されていた。
 */
describe('RunHistoryTab number formatting via SSoT (issue #266)', () => {
  const bigRuns = [
    { run_id: 'x', run_at: '2025-01-01T00:00', sharpe_ratio: 1.2, total_return_pct: 1234.5, max_drawdown_pct: -5 },
  ] as unknown as StrategyRun[]

  it('groups thousands in the return column and keeps the + sign', () => {
    render(<RunHistoryTab runs={bigRuns} currentRunId="x" onSelectRun={() => {}} lang="ja" />)
    expect(screen.getByText('+1,234.5%')).toBeInTheDocument()
  })
})

/**
 * vis#299: strategy-file 実行（チューニング試行）のランにバッジを表示し、
 * 通常ランと区別できるようにする。
 */
describe('RunHistoryTab tuning-trial badge (issue #299)', () => {
  const runsWithSource = [
    { run_id: 'a', run_at: '2025-01-01T00:00', sharpe_ratio: 1.2, total_return_pct: 12.3, max_drawdown_pct: -5, source: 'strategy-file' },
    { run_id: 'b', run_at: '2025-01-02T00:00', sharpe_ratio: 0.2, total_return_pct: -8.4, max_drawdown_pct: -10, source: 'strategy' },
    { run_id: 'c', run_at: '2025-01-03T00:00', sharpe_ratio: 0.5, total_return_pct: 1.0, max_drawdown_pct: -3, source: null },
  ] as unknown as StrategyRun[]

  it('shows the badge only for strategy-file runs', () => {
    render(
      <RunHistoryTab runs={runsWithSource} currentRunId="a" onSelectRun={() => {}} lang="ja" />,
    )
    // strategy-file の 1 行のみ（source=strategy / null は通常ラン扱い）
    expect(screen.getAllByTestId('run-source-badge')).toHaveLength(1)
    expect(screen.getByText('試行')).toBeInTheDocument()
  })

  it('shows no badge when source is absent (legacy rows)', () => {
    render(<RunHistoryTab runs={runs} currentRunId="a" onSelectRun={() => {}} lang="ja" />)
    expect(screen.queryByTestId('run-source-badge')).not.toBeInTheDocument()
  })
})
