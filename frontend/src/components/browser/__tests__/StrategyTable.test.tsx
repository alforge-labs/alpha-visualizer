import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { StrategyTable } from '../StrategyTable'

function renderTable(total: number) {
  render(
    <StrategyTable
      items={[]}
      total={total}
      sortKey="latest_sharpe"
      sortDir="desc"
      onSort={vi.fn()}
      selectedId={null}
      onSelect={vi.fn()}
      compareIds={[]}
      onToggleCompare={vi.fn()}
      lang="ja"
    />,
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

/**
 * vis#299: Browse 一覧の latest 指標が「保存していないチューニング試行ラン」に
 * すり替わったことに気づけるよう、latest_source=strategy-file にマーカーを出す。
 */
describe('<StrategyTable /> latest-source marker (issue #299)', () => {
  function renderWithItem(latestSource: string | null) {
    render(
      <MemoryRouter>
        <StrategyTable
          items={[
            {
              strategy_id: 's1',
              name: 'S1',
              symbol: 'AAPL',
              timeframe: '1d',
              tags: [],
              target_symbols: [],
              latest_sharpe: 1.2,
              latest_source: latestSource,
            } as unknown as import('../../../api/types').StrategyListItem,
          ]}
          total={1}
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

  it('shows the marker when the latest run is a strategy-file trial', () => {
    renderWithItem('strategy-file')
    expect(screen.getByTestId('latest-source-badge')).toBeInTheDocument()
  })

  it('shows no marker for normal or unknown provenance', () => {
    renderWithItem('strategy')
    expect(screen.queryByTestId('latest-source-badge')).not.toBeInTheDocument()
  })
})
