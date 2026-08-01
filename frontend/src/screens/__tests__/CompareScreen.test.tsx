import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyComparison } from '../../api/types'
import { CompareScreen } from '../CompareScreen'

vi.mock('../../lib/shareCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shareCard')>()
  return { ...actual, downloadCompareShareCard: vi.fn() }
})

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// TV チャートをスタブする（このテストの関心はシェアカード導線のみ）
vi.mock('../../charts/tv/CompareEquityTV', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../charts/tv/CompareEquityTV')>()
  return { ...actual, CompareEquityTV: () => <div data-testid="compare-equity-tv" /> }
})

import { downloadCompareShareCard } from '../../lib/shareCard'

const STRATS = [
  {
    id: 'sma_v1',
    name: 'SMA v1',
    symbol: 'SPY',
    total_return_pct: 12.3,
    cagr_pct: 5.1,
    sharpe_ratio: 1.4,
    sortino_ratio: 1.9,
    max_drawdown_pct: -8.2,
    win_rate_pct: 55,
    profit_factor: 1.6,
    total_trades: 40,
    is_baseline: true,
    equity: { dates: ['2020-01-02', '2020-01-03', '2020-01-06'], values: [100, 110, 104.5] },
    daily_returns: [0.1, -0.05],
  },
  {
    id: 'rsi_v1',
    name: 'RSI v1',
    symbol: 'SPY',
    total_return_pct: -4.2,
    cagr_pct: -1.1,
    sharpe_ratio: 0.4,
    sortino_ratio: 0.5,
    max_drawdown_pct: -12.9,
    win_rate_pct: 44,
    profit_factor: 0.9,
    total_trades: 31,
    is_baseline: false,
    equity: { dates: ['2020-01-02', '2020-01-03', '2020-01-06'], values: [100, 96, 96.96] },
    daily_returns: [-0.02, 0.01],
  },
] as unknown as StrategyComparison[]

/**
 * Compare 画面のシェアカード導線（Wave 4）: 複数戦略の比較結果を
 * 1枚のカードとしてシェアでき、カードが AlphaForge の認知経路になる。
 */
describe('<CompareScreen /> share card', () => {
  it('renders a share button and triggers the compare share card download', async () => {
    render(<CompareScreen data={STRATS} lang="ja" symbol="SPY" />)
    const btn = screen.getByRole('button', { name: /シェアカード/ })
    await userEvent.click(btn)
    expect(downloadCompareShareCard).toHaveBeenCalledTimes(1)
    const call = vi.mocked(downloadCompareShareCard).mock.calls[0]
    expect(call?.[0]).toBe(STRATS)
    expect(call?.[1]).toBe('SPY')
    expect(call?.[2]).toBe('ja')
  })

  it('renders an X share button that downloads the card and opens the post intent', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<CompareScreen data={STRATS} lang="ja" symbol="SPY" />)
    await userEvent.click(screen.getByRole('button', { name: /X で共有/ }))
    expect(downloadCompareShareCard).toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = String(openSpy.mock.calls[0]?.[0])
    expect(url).toContain('https://x.com/intent/post?text=')
    // ベスト（最高シャープ = SMA v1: 1.4 > 0.4）の名前が本文に反映される
    expect(url).toContain(encodeURIComponent('SMA v1'))
    openSpy.mockRestore()
  })
})

/**
 * issue #352: PF が算出不可（null）の戦略で、サイドカードが「0.00」・
 * 指標テーブルが「—」と同一画面で食い違っていた。0.00 は「総利益ゼロ」を
 * 意味してしまうため、カード側も「—」に統一する。
 */
describe('<CompareScreen /> null metrics on side cards (issue #352)', () => {
  const withNullPf = [
    { ...STRATS[0] },
    {
      ...STRATS[1],
      profit_factor: null,
      sharpe_ratio: null,
      total_return_pct: null,
      max_drawdown_pct: null,
    },
  ] as unknown as StrategyComparison[]

  it('renders — instead of 0.00 for null side-card values', () => {
    render(<CompareScreen data={withNullPf} lang="ja" symbol="SPY" />)
    // null の PF / Sharpe が 0.00 と表示されない
    expect(screen.queryByText('0.00')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
    // カード側も指標テーブルと同じ「—」で統一される
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })
})

/**
 * issue #367: ヘッダーがベース銘柄のみで、別銘柄・別期間の比較で
 * 前提が読み取れなかった。全銘柄・データ期間・期間差異の注記を表示する。
 */
describe('<CompareScreen /> header context (issue #367)', () => {
  it('全銘柄とデータ期間をヘッダーに表示する', () => {
    const mixed = [
      { ...STRATS[0], symbol: 'SPY' },
      { ...STRATS[1], symbol: 'QQQ' },
    ] as unknown as StrategyComparison[]
    render(<CompareScreen data={mixed} lang="ja" symbol="SPY" />)
    // ベース銘柄だけでなく比較対象の銘柄も見える
    expect(screen.getByText(/SPY \/ QQQ/)).toBeInTheDocument()
    // データ期間（equity の日付範囲）が明示される
    expect(screen.getByText(/2020-01/)).toBeInTheDocument()
  })

  it('実行期間が異なる戦略を含む場合は注記を表示する', () => {
    const mismatched = [
      { ...STRATS[0] },
      {
        ...STRATS[1],
        equity: { dates: ['2022-06-01', '2022-06-02'], values: [100, 101] },
      },
    ] as unknown as StrategyComparison[]
    render(<CompareScreen data={mismatched} lang="ja" symbol="SPY" />)
    expect(screen.getByText(/実行期間が異なります/)).toBeInTheDocument()
  })

  it('期間が揃っている場合は注記を出さない', () => {
    render(<CompareScreen data={STRATS} lang="ja" symbol="SPY" />)
    expect(screen.queryByText(/実行期間が異なります/)).not.toBeInTheDocument()
  })
})

/**
 * issue #375: 相関表示まであるのに合成が無かった。ウェイト指定の
 * 加重合成（毎日リバランス想定）の統計とエクイティを表示する。
 */
describe('<CompareScreen /> portfolio composer (issue #375)', () => {
  it('2 戦略以上で合成セクションと統計を表示する', () => {
    render(<CompareScreen data={STRATS} lang="ja" symbol="SPY" />)
    const section = screen.getByTestId('portfolio-composer')
    expect(section).toBeInTheDocument()
    expect(screen.getByText('ポートフォリオ合成')).toBeInTheDocument()
    // 等ウェイト初期値の入力が戦略ごとにある
    expect(screen.getByLabelText('SMA v1 のウェイト')).toBeInTheDocument()
    expect(screen.getByLabelText('RSI v1 のウェイト')).toBeInTheDocument()
    // 合成統計（Sharpe / Max DD / 共通期間）
    const stats = screen.getByTestId('portfolio-stats')
    expect(stats.textContent).toContain('Sharpe')
    expect(stats.textContent).toContain('Max DD')
    expect(screen.getByText(/共通期間 \d+ 日/)).toBeInTheDocument()
  })

  it('ウェイト変更で構成比が更新される', () => {
    render(<CompareScreen data={STRATS} lang="ja" symbol="SPY" />)
    const input = screen.getByLabelText('SMA v1 のウェイト')
    fireEvent.change(input, { target: { value: '3' } })
    // 3 : 1 → 75% / 25%
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })
})
