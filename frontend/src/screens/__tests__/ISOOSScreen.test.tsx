import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { BacktestDetail } from '../../api/types'
import { ISOOSScreen } from '../ISOOSScreen'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// TV チャートをスタブする（このテストの関心はサブタイトルのみ）
vi.mock('../../charts/tv/EquityDrawdownPaneTV', () => ({
  EquityDrawdownPaneTV: () => <div data-testid="equity-dd-tv" />,
}))

/**
 * issue #353: サブタイトル「IS 60% / OOS 40%」がハードコードで、実際の
 * 分割設定と乖離していた。実データ（is_cutoff.index / equity 長）から
 * 動的に算出する。
 */
function makeDetail(cutoffIndex: number, totalBars: number): BacktestDetail {
  return {
    run_id: 'r1',
    strategy_id: 's1',
    equity: {
      dates: Array.from({ length: totalBars }, (_, i) => `2023-01-${(i % 28) + 1}`),
      values: Array.from({ length: totalBars }, (_, i) => 100 + i),
    },
    drawdown: Array.from({ length: totalBars }, () => 0),
    is_cutoff: { date: '2023-06-30', index: cutoffIndex },
    metrics: {},
    is_metrics: { sharpe_ratio: 1.2, win_rate_pct: 55, profit_factor: 1.5 },
    oos_metrics: { sharpe_ratio: 1.0, win_rate_pct: 52, profit_factor: 1.3 },
  } as unknown as BacktestDetail
}

describe('ISOOSScreen subtitle (issue #353)', () => {
  it('derives the IS/OOS split ratio from is_cutoff.index and equity length', () => {
    render(<ISOOSScreen data={makeDetail(70, 100)} compact={false} lang="ja" />)
    expect(screen.getByText(/IS 70% \(〜2023-06-30\)/)).toBeInTheDocument()
    expect(screen.getByText(/OOS 30%/)).toBeInTheDocument()
    expect(screen.queryByText(/IS 60%/)).not.toBeInTheDocument()
  })

  it('falls back to the cutoff date only when the ratio is not derivable', () => {
    render(<ISOOSScreen data={makeDetail(-1, 100)} compact={false} lang="ja" />)
    expect(screen.queryByText(/IS .*%/)).not.toBeInTheDocument()
    expect(screen.getByText(/2023-06-30/)).toBeInTheDocument()
  })
})
