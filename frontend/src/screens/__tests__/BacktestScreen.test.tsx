import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { MOCK_BACKTEST } from '../../mock/btData'
import { BacktestScreen } from '../BacktestScreen'
import { api } from '../../api/client'

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

// issue #370: ベンチマーク OHLC 取得を mock（ApiError も含める・useFetchByKey の分岐用）
vi.mock('../../api/client', () => ({
  api: { getHistorical: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number
    url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  },
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

/**
 * issue #362: P&L・エクイティに通貨単位・初期資金の前提が無く、初級者が
 * 損益の規模感を掴めなかった。initial_capital は forge の journal のみに
 * 記録され visualizer の DB には無いため、データから取れる事実
 * （開始時評価額 = equity 先頭値）+「口座通貨建て」の注記で前提を示す。
 */
describe('BacktestScreen capital context note (issue #362)', () => {
  it('エクイティ節に開始時評価額と口座通貨建ての注記を表示する', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    const note = screen.getByTestId('capital-context-note')
    expect(note.textContent).toContain('開始時評価額')
    expect(note.textContent).toContain('口座通貨')
  })
})


/**
 * issue #370: 同一銘柄 B&H 固定だったベンチマークを任意銘柄にできる。
 * 適用で OHLC を取得し、対ベンチ指標（β/α/IR/超過）をフロント計算して表示する。
 */
describe('BacktestScreen custom benchmark (issue #370)', () => {
  it('銘柄を適用すると対ベンチ指標が表示される', async () => {
    const dates = MOCK_BACKTEST.equity.dates
    vi.mocked(api.getHistorical).mockResolvedValue({
      symbol: 'SPY',
      interval: '1d',
      bars: dates.map((d: string, i: number) => ({
        time: d,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100 + i,
        volume: 1000,
      })),
    } as never)

    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('ベンチマーク銘柄'), { target: { value: 'SPY' } })
    fireEvent.click(screen.getByRole('button', { name: '適用' }))

    const stats = await screen.findByTestId('benchmark-stats')
    expect(stats.textContent).toContain('vs SPY')
    expect(stats.textContent).toContain('β')
    expect(stats.textContent).toContain('IR')
    expect(stats.textContent).toContain('超過リターン')
  })

  it('価格データが無い銘柄では案内を表示する', async () => {
    const { ApiError } = await import('../../api/client')
    vi.mocked(api.getHistorical).mockRejectedValue(
      new ApiError('API 404: {"detail":"not found"}', 404, '/api/historical/XXX'),
    )
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('ベンチマーク銘柄'), { target: { value: 'XXX' } })
    fireEvent.click(screen.getByRole('button', { name: '適用' }))
    expect(await screen.findByText(/価格データを取得できません/)).toBeInTheDocument()
  })
})

/**
 * issue #382: 「どのパラメータで実行したか」が UI に出ず試行を再現できなかった。
 * forge#1356 が保存する params を run 単位で常設表示する。
 */
describe('BacktestScreen run params (issue #382)', () => {
  it('params がある run は使用パラメータを表示する', () => {
    render(
      <MemoryRouter>
        <BacktestScreen
          data={{ ...MOCK_BACKTEST, params: { period: 20, threshold: 1.5 } }}
          compact={false}
          lang="ja"
        />
      </MemoryRouter>,
    )
    const line = screen.getByTestId('run-params')
    expect(line.textContent).toContain('period=20')
    expect(line.textContent).toContain('threshold=1.5')
  })

  it('params が無い run（旧 forge 記録）は表示しない', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('run-params')).not.toBeInTheDocument()
  })
})
