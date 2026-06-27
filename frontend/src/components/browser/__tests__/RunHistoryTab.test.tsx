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
