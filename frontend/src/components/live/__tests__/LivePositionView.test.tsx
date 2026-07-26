import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveSummary } from '../../../api/types'
import type { EquityDrawdownPaneTVProps } from '../../../charts/tv/EquityDrawdownPaneTV'
import { toDrawdown } from '../../../lib/liveEquity'
import { LivePositionView } from '../LivePositionView'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、TV チャートをスタブする。
// ただし props を握りつぶす zero-prop stub では「チャートに何が渡ったか」を一切検証できない
// ため、実際に渡された props を module-scoped 変数へキャプチャする（vi.mock はホイストされる
// ので、キャプチャ先も vi.hoisted で用意する）。
const equityPaneProps = vi.hoisted(() => ({ current: null as EquityDrawdownPaneTVProps | null }))

vi.mock('../../../charts/tv/EquityDrawdownPaneTV', () => ({
  EquityDrawdownPaneTV: (props: EquityDrawdownPaneTVProps) => {
    equityPaneProps.current = props
    return <div data-testid="equity-pane-stub" />
  },
}))

beforeEach(() => {
  equityPaneProps.current = null
})

vi.mock('../../../lib/shareCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/shareCard')>()
  return { ...actual, downloadLiveShareCard: vi.fn() }
})

import { downloadLiveShareCard } from '../../../lib/shareCard'

const SUMMARY = {
  strategy_id: 'beat_qqq_hedged_v1',
  portfolio_id: 'beat_qqq_hedged_v1',
  kind: 'position',
  metrics: {
    total_return_pct: 5.4,
    cagr_pct: 11.2,
    sharpe_ratio: 1.31,
    // LivePositionMetrics の max_drawdown_pct は正値規約
    max_drawdown_pct: 6.5,
    volatility_pct: 9.9,
  },
  backtest_metrics: null,
  equity: [
    ['2026-05-01', 10000],
    ['2026-05-02', 10100],
    ['2026-05-03', 10250],
  ],
  receipts_count: 3,
  sub_strategies: ['gld_bh_v1'],
  updated_at: '2026-06-06T10:50:22+00:00',
} as unknown as LiveSummary

/**
 * Live（ポジションベース）画面のシェアカード導線（Wave 4）:
 * ペーパートレード実績＝実運用の証拠を1枚のカードとしてシェアでき、
 * カードが AlphaForge の認知経路になる。
 */
describe('<LivePositionView /> share card', () => {
  it('renders a share button and triggers the live share card download', async () => {
    render(<LivePositionView summary={SUMMARY} warnings={[]} lang="ja" />)
    const btn = screen.getByRole('button', { name: /シェアカード/ })
    await userEvent.click(btn)
    expect(downloadLiveShareCard).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadLiveShareCard).mock.calls[0]?.[0]).toBe(SUMMARY)
    expect(vi.mocked(downloadLiveShareCard).mock.calls[0]?.[1]).toBe('ja')
  })

  it('renders an X share button that downloads the card and opens the post intent', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<LivePositionView summary={SUMMARY} warnings={[]} lang="ja" />)
    await userEvent.click(screen.getByRole('button', { name: /X で共有/ }))
    expect(downloadLiveShareCard).toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = String(openSpy.mock.calls[0]?.[0])
    expect(url).toContain('https://x.com/intent/post?text=')
    expect(url).toContain(encodeURIComponent('beat_qqq_hedged_v1'))
    openSpy.mockRestore()
  })
})

/**
 * 組み立て（Task 13）: KPI 行・比較チャート・建玉テーブルの後方互換。
 *
 * ベンチマーク・backtest 比較・建玉を持たない旧 DB 応答でもクラッシュせず、
 * 存在するデータ（KPI・equity/drawdown チャート）だけを描画することを保証する。
 *
 * `equityPaneProps`（キャプチャ mock）経由でチャートへ実際に渡された props を
 * 検証することで、「JSX が例外を投げない」以上の保証（`equity`/`dates` が
 * 入れ替わっていないか、`overlays` が本当に空か）まで固定する。
 */
describe('<LivePositionView /> assembly (Task 13)', () => {
  it('ベンチマーク・建玉が無い旧 DB 応答でもクラッシュせず描画する', () => {
    const summary = {
      strategy_id: 'pf_1',
      kind: 'position' as const,
      metrics: {
        total_return_pct: -0.5,
        cagr_pct: -3,
        sharpe_ratio: -2,
        max_drawdown_pct: 0.7,
        volatility_pct: 1.3,
      },
      equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 995_000],
      ] as [string, number][],
      receipts_count: 78,
      // benchmark_equity / backtest_equity / positions は未定義（旧 DB）
    }
    render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)
    expect(screen.getByTestId('kpi-current-value')).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-excess-index')).not.toBeInTheDocument()

    // equity/dates の取り違えが無いこと、drawdown が equity と同じ長さで
    // 計算されていること、overlays が空配列であること（ダッシュ埋めでなく本当に空）を固定する。
    const props = equityPaneProps.current
    expect(props).not.toBeNull()
    expect(props?.equity).toEqual([1_000_000, 995_000])
    expect(props?.dates).toEqual(['2026-06-04T00:00:00', '2026-06-05T00:00:00'])
    expect(props?.drawdown).toHaveLength(2)
    expect(props?.drawdown).toEqual(toDrawdown([1_000_000, 995_000]))
    expect(props?.overlays).toEqual([])
  })

  it('ベンチマークがあれば overlays に指数系列を equity と同じインデックスで積む', () => {
    const summary = {
      strategy_id: 'pf_1',
      kind: 'position' as const,
      metrics: { total_return_pct: -0.5 },
      equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 995_000],
      ] as [string, number][],
      benchmark_equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 1_020_000],
      ] as [string, number][],
      positions: [
        {
          ticker: 'US.GLD',
          qty: 90,
          avg_cost: 396.64,
          last_price: 371.9,
          market_value: 33471,
          weight_pct: 3.4,
          unrealized_pnl: -2227,
          unrealized_pnl_pct: -6.2,
        },
      ],
      cash: 961_021,
      total_value: 994_492,
      receipts_count: 78,
    }
    render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)
    expect(screen.getByTestId('kpi-excess-index')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()

    const overlays = equityPaneProps.current?.overlays ?? []
    expect(overlays).toHaveLength(1)
    expect(overlays[0]?.label).toBe('指数（Buy & Hold）')
    expect(overlays[0]?.values).toEqual([1_000_000, 1_020_000])
  })

  it('overlay で除外された系列は KPI の超過リターンにも使われない（Finding 1: チャートと KPI の判定を統一）', () => {
    // WHY: buildOverlay がチャート描画を弾く系列を、KPI 行（超過リターン）が
    // 生の summary.benchmark_equity / backtest_equity をそのまま受け取って
    // 描画してしまうと、「チャートには出ない指数」が「超過リターン vs 指数」
    // という見出し数値としては表示される、という矛盾した状態になる。
    // LivePositionView は許容済みの系列だけを LiveKpiRow に渡す契約を検証する。
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const summary = {
      strategy_id: 'pf_1',
      kind: 'position' as const,
      metrics: { total_return_pct: -0.5 },
      equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 995_000],
        ['2026-06-06T00:00:00', 990_000],
      ] as [string, number][],
      // equity より 1 点短い（契約違反を模擬）→ overlay からも KPI からも除外されるべき
      benchmark_equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 1_020_000],
      ] as [string, number][],
      // equity と同じ長さ → overlay にも KPI にも採用されるべき
      backtest_equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 1_010_000],
        ['2026-06-06T00:00:00', 1_015_000],
      ] as [string, number][],
      receipts_count: 78,
    }
    render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)

    expect(equityPaneProps.current?.overlays ?? []).toHaveLength(1)
    // 指数（長さ不一致）はチャートにもKPIにも出ない
    expect(screen.queryByTestId('kpi-excess-index')).not.toBeInTheDocument()
    // バックテスト（長さ一致）はチャートにもKPIにも出る
    expect(screen.getByTestId('kpi-excess-backtest')).toBeInTheDocument()

    warnSpy.mockRestore()
  })

  it('overlay の長さが equity と食い違う系列は除外し、一致する系列だけ積む（console.warn で警告）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const summary = {
      strategy_id: 'pf_1',
      kind: 'position' as const,
      metrics: { total_return_pct: -0.5 },
      equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 995_000],
        ['2026-06-06T00:00:00', 990_000],
      ] as [string, number][],
      // equity より 1 点短い（契約違反を模擬）→ 除外されるべき
      benchmark_equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 1_020_000],
      ] as [string, number][],
      // equity と同じ長さ → 採用されるべき
      backtest_equity: [
        ['2026-06-04T00:00:00', 1_000_000],
        ['2026-06-05T00:00:00', 1_010_000],
        ['2026-06-06T00:00:00', 1_015_000],
      ] as [string, number][],
      receipts_count: 78,
    }
    render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)

    const overlays = equityPaneProps.current?.overlays ?? []
    expect(overlays).toHaveLength(1)
    expect(overlays[0]?.label).toBe('バックテスト')
    expect(overlays[0]?.values).toEqual([1_000_000, 1_010_000, 1_015_000])

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const warning = String(warnSpy.mock.calls[0]?.[0])
    expect(warning).toContain('指数（Buy & Hold）')
    expect(warning).toContain('3')
    expect(warning).toContain('2')

    warnSpy.mockRestore()
  })
})
