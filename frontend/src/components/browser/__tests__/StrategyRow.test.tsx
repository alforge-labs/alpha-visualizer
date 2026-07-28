import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { StrategyRow } from '../StrategyRow'

function mkItem(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
    // strategy_id は overrides に必須プロパティとして含まれるため、下の
    // ...overrides で必ず上書きされる。二重指定は tsc の TS2783
    // （spread による上書き警告）を build エラーにしてしまうため書かない。
    name: 'SPY EMA Cross v1',
    symbol: null,
    timeframe: '1d',
    tags: [],
    target_symbols: [],
    latest_sharpe: null,
    latest_return_pct: null,
    latest_max_drawdown_pct: null,
    latest_profit_factor: null,
    latest_win_rate_pct: null,
    latest_total_trades: null,
    last_run_at: null,
    latest_source: null,
    ...overrides,
  }
}

function renderRow(s: StrategyListItem, indent = false) {
  return render(
    <MemoryRouter>
      <table><tbody>
        <StrategyRow
          s={s}
          selected={false}
          inCompare={false}
          maxCompareReached={false}
          onSelect={vi.fn()}
          onToggleCompare={vi.fn()}
          onHover={vi.fn()}
          sparkValues={undefined}
          lang="ja"
          indent={indent}
        />
      </tbody></table>
    </MemoryRouter>,
  )
}

describe('<StrategyRow />', () => {
  it('strategy_id を表示する', () => {
    // 実データでは同名 15 件が存在し、ID が唯一の識別子になる
    renderRow(mkItem({ strategy_id: 'amd_ema_st_repeat2_v1_optimized' }))
    expect(screen.getByText('amd_ema_st_repeat2_v1_optimized')).toBeInTheDocument()
  })

  it('未実行でも target_symbols から銘柄チップを出す', () => {
    // 実データでは 311 件がこの経路。symbol だけを見ると空欄になる
    renderRow(mkItem({ strategy_id: 'a', symbol: null, target_symbols: ['SPY'] }))
    expect(screen.getByText('SPY')).toBeInTheDocument()
    expect(screen.queryByText(/未割当/)).toBeNull()
  })

  it('実行済みなら実際に回した銘柄を定義側より優先して出す', () => {
    renderRow(mkItem({ strategy_id: 'a', symbol: 'QQQ', target_symbols: ['SPY'] }))
    expect(screen.getByText('QQQ')).toBeInTheDocument()
    expect(screen.queryByText('SPY')).toBeNull()
  })

  it('銘柄がどこからも判明しなければ未割当と出す', () => {
    renderRow(mkItem({ strategy_id: 'a', symbol: null, target_symbols: [] }))
    expect(screen.getByText(/未割当/)).toBeInTheDocument()
  })

  it('名前は詳細画面へのリンクになっている', () => {
    renderRow(mkItem({ strategy_id: 'sma_cross' }))
    const link = screen.getByRole('link', { name: /SPY EMA Cross v1/ })
    expect(link.getAttribute('href')).toBe('/detail/sma_cross')
  })

  // issue #334: 実データでは名前列が長い戦略名で 915px まで広がり、table-layout: auto の
  // 配分で最終実行列が宣言幅 132px から 83px に圧縮される。日付が 2 行に折り返され、
  // 行高が想定 44px に対し 55px になっていた（136 行でページ全高が 8,165px）。
  // 折り返しを禁じれば列が 106px まで押し返され 1 行に収まる（実測で 44px / 6,652px）。
  // 日付は分割して読む値ではないので、幅が足りなければ横スクロールに逃がすのが正しい。
  it('最終実行の日付は折り返さない（列が圧縮されても行高を一定に保つ）', () => {
    renderRow(mkItem({ strategy_id: 'a', last_run_at: '2026-05-28T00:00:00Z' }))
    const cell = screen.getByText('2026-05-28').closest('td')
    expect(cell).not.toBeNull()
    expect(cell!.style.whiteSpace).toBe('nowrap')
  })
})
