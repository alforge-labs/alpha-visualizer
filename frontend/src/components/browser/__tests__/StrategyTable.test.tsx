import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { buildRecipes, type Recipe } from '../../../lib/recipes'
import { StrategyTable } from '../StrategyTable'

function mkItem(overrides: Partial<StrategyListItem> & { strategy_id: string }): StrategyListItem {
  return {
    // strategy_id は overrides に必須プロパティとして含まれるため、下の
    // ...overrides で必ず上書きされる。二重指定は tsc の TS2783
    // （spread による上書き警告）を build エラーにしてしまうため書かない。
    name: 'S1',
    symbol: 'AAPL',
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

function renderTable(strategyTotal: number, recipes: Recipe[] = []) {
  render(
    <MemoryRouter>
      <StrategyTable
        recipes={recipes}
        strategyTotal={strategyTotal}
        recipeTotal={recipes.length}
        hiddenUnrunRecipeCount={0}
        sortKey="latest_sharpe"
        sortDir="desc"
        onSort={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
        compareIds={[]}
        onToggleCompare={vi.fn()}
        lang="ja"
      />
    </MemoryRouter>,
  )
}

/**
 * 空状態の2分岐（Wave 6）:
 * - total > 0 で items が空 → フィルタが原因（既存文言）
 * - total === 0 → データが一切ない初回起動。forge 未導入の OSS ユーザーの
 *   最初の接点なので、デッドエンドにせずサンプル起動と AlphaForge への
 *   導線を提示する（オンボーディング CTA）
 */
describe('<StrategyTable /> empty states', () => {
  it('shows the filter-oriented message when data exists but filters exclude all', () => {
    renderTable(3)
    expect(screen.getByText(/該当する戦略はありません/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /AlphaForge/ })).toBeNull()
  })

  it('shows the onboarding CTA when there is no data at all', () => {
    renderTable(0)
    expect(screen.getByText(/まだ戦略がありません/)).toBeInTheDocument()
    // サンプルデータでの起動方法を提示
    expect(screen.getByText(/--use-bundled-samples/)).toBeInTheDocument()
    // AlphaForge への送客リンク（UTM 付き・新規タブ告知）
    const link = screen.getByRole('link', { name: /AlphaForge/ })
    expect(link.getAttribute('href')).toBe(
      'https://alforgelabs.com/?utm_source=alpha-visualizer&utm_medium=empty_state',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel') ?? '').toContain('noopener')
  })
})

describe('<StrategyTable /> レシピ展開', () => {
  it('折り畳み時は 1 行、展開すると variant の行が増える', async () => {
    const recipes = buildRecipes([
      mkItem({ strategy_id: 'v1', name: 'X', symbol: 'SPY', latest_sharpe: 1.0, last_run_at: '2026-01-01T00:00:00' }),
      mkItem({ strategy_id: 'v2', name: 'X', symbol: 'SPY' }),
      mkItem({ strategy_id: 'v3', name: 'X', symbol: 'SPY' }),
    ])
    renderTable(3, recipes)

    // ヘッダー行 + レシピ 1 行
    expect(screen.getAllByRole('row')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /試行を展開/ }))
    // ヘッダー行 + レシピ 1 行 + variant 3 行
    expect(screen.getAllByRole('row')).toHaveLength(5)
    expect(screen.getByText('v2')).toBeInTheDocument()
  })
})
