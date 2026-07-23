import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MOCK_BACKTEST } from '../../mock/btData'
import { BacktestScreen } from '../BacktestScreen'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// TV チャートをスタブする（このテストの関心は source 注記バナーのみ）
vi.mock('../../charts/tv/EquityDrawdownPaneTV', () => ({
  EquityDrawdownPaneTV: (props: { showRegime?: boolean }) => (
    <div data-testid="equity-pane-stub" data-show-regime={String(!!props.showRegime)} />
  ),
}))
vi.mock('../../charts/tv/RollingMetricsChartTV', () => ({
  RollingMetricsChartTV: () => <div data-testid="rolling-metrics-chart-tv" />,
}))

// listLive のネットワークアクセスを避ける（バナーの検証に live 情報は不要）
vi.mock('../../hooks/useLiveAvailability', () => ({
  useLiveAvailability: () => ({ hasLive: false, error: null }),
}))

/**
 * vis#299: 表示中のランが定義ファイル直接実行（チューニング試行）の場合、
 * 保存済みの戦略定義と異なる可能性があることを注記する。
 */
describe('BacktestScreen source note (issue #299)', () => {
  it('shows the trial note for strategy-file runs', () => {
    render(
      <MemoryRouter>
        <BacktestScreen
          data={{ ...MOCK_BACKTEST, source: 'strategy-file' }}
          compact={false}
          lang="ja"
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('source-trial-note')).toBeInTheDocument()
  })

  it('shows no note for normal or unknown provenance', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('source-trial-note')).not.toBeInTheDocument()
  })
})

/**
 * vis#308: --carry ラン（carry_adjusted あり）ではメトリクスタブに
 * キャリー近似（金利差）カードを表示し、price-only との対比を可能にする。
 * 無いラン（キー無し = キャリー計上なし）では表示しない。
 */
describe('BacktestScreen carry adjusted card (issue #308)', () => {
  const carry = {
    metrics: {
      total_return_pct: 12.3,
      cagr_pct: 9.8,
      max_drawdown_pct: 4.5,
      sharpe_ratio: 1.35,
      volatility_pct: 8.2,
    },
    note: '金利差近似の参考値',
  }

  it('shows the carry card on the metrics tab for carry runs', () => {
    render(
      <MemoryRouter>
        <BacktestScreen
          data={{ ...MOCK_BACKTEST, carry_adjusted: carry }}
          compact={false}
          lang="ja"
        />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('メトリクス'))
    const card = screen.getByTestId('carry-adjusted-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveTextContent('12.30')
    expect(card).toHaveTextContent('1.35')
    expect(card).toHaveTextContent('金利差近似の参考値')
  })

  it('shows no carry card when the run has no carry accrual', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('メトリクス'))
    expect(screen.queryByTestId('carry-adjusted-card')).not.toBeInTheDocument()
  })
})

/**
 * issue #317: #187 で visx を撤去した際、レジーム表示のトグルも一緒に消えていた。
 * regime_series を持つランでは トグルを出し、押すと表示状態が切り替わること。
 */
describe('BacktestScreen regime toggle (issue #317)', () => {
  it('regime_series があるとトグルを表示し、既定で ON', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'レジーム' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('equity-pane-stub')).toHaveAttribute(
      'data-show-regime',
      'true',
    )
  })

  it('トグルを押すとレジーム表示が OFF になる', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'レジーム' }))
    expect(screen.getByRole('button', { name: 'レジーム' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByTestId('equity-pane-stub')).toHaveAttribute(
      'data-show-regime',
      'false',
    )
  })

  it('regime_series が無いランではトグルを出さない', () => {
    render(
      <MemoryRouter>
        <BacktestScreen
          data={{ ...MOCK_BACKTEST, regime_series: undefined }}
          compact={false}
          lang="ja"
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'レジーム' })).toBeNull()
  })
})
